// Translated fixture from packages/gateway/src/ws.test.ts; expected literals are in tail_static.rs.


import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";

import type { AppConfig } from "../../../../packages/gateway/src/config.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import type { BackgroundCommandResult } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/ws.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_ws_test_ts_183_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
await __jait_hook_5762();
try {
await (async()=>{

    const registered = vi.spyOn(plane.messenger, "register");
    const alice = openWs(port, { token: await createToken("alice") });
    const bob = openWs(port, { token: await createToken("bob") });
    try {
      await Promise.all([waitForOpen(alice.ws), waitForOpen(bob.ws)]);
      await alice.collector.next(); await bob.collector.next();
      alice.ws.send(JSON.stringify({ type: "messenger.register", payload: { enabled: true } }));
      await vi.waitFor(() => __jait_capture(1, (registered.mock.calls)));
      const response = plane.messenger.request("alice", { action: "status" });
      const request = await alice.collector.next();
      __jait_capture(2, (request.type));
      const done = vi.fn(); void response.then(done);
      bob.ws.send(JSON.stringify({ type: "messenger.result", payload: { requestId: request.payload.requestId, result: { ok: true, message: "forged" } } }));
      await new Promise(resolve => setTimeout(resolve, 20));
      __jait_capture(3, (done.mock.calls));
      alice.ws.send(JSON.stringify({ type: "messenger.result", payload: { requestId: request.payload.requestId, result: { ok: true, message: "connected" } } }));
      __jait_capture(4, ((await response).message));
      __jait_capture(5, ((await plane.messenger.request("bob", { action: "status" })).ok));
      const revoked = plane.messenger.request("alice", { action: "status" });
      await alice.collector.next();
      alice.ws.send(JSON.stringify({ type: "messenger.register", payload: { enabled: false } }));
      __jait_capture(6, ((await revoked).ok));
    } finally { alice.ws.close(); bob.ws.close(); }
  
})();

} finally {
await __jait_hook_8506();
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_209_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
await __jait_hook_5762();
try {
await (async()=>{

    __jait_capture(1, (plane.canAccessNode?.("gateway", "owner")));
    plane.isGatewayOwner = userId => userId === "owner";
    __jait_capture(2, (plane.canAccessNode?.("gateway", "owner")));
    __jait_capture(3, (plane.canAccessNode?.("gateway", "other-user")));
    __jait_capture(4, (plane.canAccessNode?.("gateway", null)));
    __jait_capture(5, (plane.canAccessNode?.("unowned-remote", "owner")));
  
})();

} finally {
await __jait_hook_8506();
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_222_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
await __jait_hook_5762();
try {
await (async()=>{

    plane.getAgentControlState = userId => ({ halted: userId === "halted-owner", reason: userId, haltedAt: null, updatedAt: null });
    for (const userId of ["halted-owner", "other-owner"]) {
      const token = await createToken(userId);
      const { ws, collector } = openWs(port, { token });
      try {
        await waitForOpen(ws);
        await collector.next();
        ws.send(JSON.stringify({ type: "resource.subscribe", payload: { resource: "root:/agent-control" } }));
        let snapshot = await collector.next();
        while (snapshot.type !== "agent.halted") snapshot = await collector.next();
        __jait_capture(1, (snapshot.payload), ({ halted: userId === "halted-owner", reason: userId }));
      } finally { ws.close(); }
    }
  
})();

} finally {
await __jait_hook_8506();
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_238_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
await __jait_hook_5762();
try {
await (async()=>{

    const { ws, collector } = openWs(port);
    await waitForOpen(ws);

    const msg = await collector.next();
    __jait_capture(1, (msg.type));
    __jait_captureType(2, (msg.payload.clientId));
    ws.close();
  
})();

} finally {
await __jait_hook_8506();
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_248_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
await __jait_hook_5762();
try {
await (async()=>{

    __jait_capture(1, (plane.clientCount));

    const { ws, collector } = openWs(port);
    await waitForOpen(ws);
    await collector.next(); // consume session.created

    __jait_capture(2, (plane.clientCount));

    ws.close();
    await new Promise((r) => setTimeout(r, 150));
    __jait_capture(3, (plane.clientCount));
  
})();

} finally {
await __jait_hook_8506();
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_263_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      // authenticateClient is async and non-awaited in the connection handler,
      // so the initial session.created may show authenticated=false.
      // We verify auth completed by successfully subscribing.
      const token = await createToken("user-1");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);

      await collector.next(); // initial session.created (may be false)

      // Give the async auth time to complete
      await new Promise((r) => setTimeout(r, 100));

      // Subscribe should succeed (no UNAUTHORIZED error)
      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s1" }));
      const subMsg = await collector.next();
      __jait_capture(1, (subMsg.type));
      __jait_capture(2, (subMsg.payload.subscribed));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_284_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-2");
      const { ws, collector } = openWs(port, {
        headers: { Authorization: `Bearer ${token}` },
      });
      await waitForOpen(ws);

      await collector.next(); // initial session.created

      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s2" }));
      const subMsg = await collector.next();
      __jait_capture(1, (subMsg.type));
      __jait_capture(2, (subMsg.payload.subscribed));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_302_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-3");
      const { ws, collector } = openWs(port);
      await waitForOpen(ws);

      const initial = await collector.next();
      __jait_capture(1, (initial.type));
      __jait_capture(2, (initial.payload.authenticated));

      // Send authenticate message
      ws.send(JSON.stringify({ type: "authenticate", token }));
      const authMsg = await collector.next();
      __jait_capture(3, (authMsg.type));
      __jait_capture(4, (authMsg.payload.authenticated));
      __jait_capture(5, (authMsg.payload.userId));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_320_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const { ws } = openWs(port, { token: "bad-token" });
      await waitForOpen(ws);

      await new Promise<void>((resolve) => {
        ws.on("close", () => resolve());
        if (ws.readyState === WebSocket.CLOSED) resolve();
        setTimeout(resolve, 2000);
      });
      __jait_capture(1, (ws.readyState), (WebSocket.CLOSED));
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_332_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      plane.stop();
      const devConfig = makeConfig({ nodeEnv: "development", wsPort: 0 });
      plane = new WsControlPlane(devConfig);
      plane.start();
      const devAddr = (plane as any).wss?.address();
      const devPort = typeof devAddr === "object" ? devAddr.port : 0;

      const { ws, collector } = openWs(devPort);
      await waitForOpen(ws);

      const msg = await collector.next();
      __jait_capture(1, (msg.type));
      __jait_capture(2, (msg.payload.authenticated));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_351_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const { ws, collector } = openWs(port);
      await waitForOpen(ws);
      await collector.next(); // consume session.created

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "s1" }));
      const msg = await collector.next();
      __jait_capture(1, (msg.type));
      __jait_capture(2, (msg.payload.code));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_363_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-sub");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next(); // initial session.created

      // Wait for async token auth to complete
      await new Promise((r) => setTimeout(r, 100));

      ws.send(
        JSON.stringify({
          type: "subscribe",
          sessionId: "session-123",
          deviceId: "dev-1",
        }),
      );
      const msg = await collector.next();
      __jait_capture(1, (msg.type));
      __jait_capture(2, (msg.payload.subscribed));
      __jait_capture(3, (msg.sessionId));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_388_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-b");

      // Client 1 → session-a
      const c1 = openWs(port, { token });
      await waitForOpen(c1.ws);
      await c1.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      c1.ws.send(JSON.stringify({ type: "subscribe", sessionId: "session-a" }));
      await c1.collector.next(); // subscribe ack

      // Client 2 → session-b
      const c2 = openWs(port, { token });
      await waitForOpen(c2.ws);
      await c2.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      c2.ws.send(JSON.stringify({ type: "subscribe", sessionId: "session-b" }));
      await c2.collector.next(); // subscribe ack

      // Broadcast to session-a
      plane.broadcast("session-a", {
        type: "action.started",
        sessionId: "session-a",
        timestamp: new Date().toISOString(),
        payload: { msg: "hello" },
      });

      // ws1 should get the message
      const received = await c1.collector.next();
      __jait_capture(1, (received.type));
      __jait_capture(2, (received.payload.msg));

      // ws2 should NOT get a message
      const noMsg = await c2.collector.maybeNext(500);
      __jait_captureType(3, (noMsg));

      c1.ws.close();
      c2.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_428_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-all");

      const c1 = openWs(port, { token });
      await waitForOpen(c1.ws);
      await c1.collector.next();

      const c2 = openWs(port, { token });
      await waitForOpen(c2.ws);
      await c2.collector.next();

      plane.broadcastAll({
        type: "session.updated",
        sessionId: "",
        timestamp: new Date().toISOString(),
        payload: { broadcast: true },
      });

      const [msg1, msg2] = await Promise.all([
        c1.collector.next(),
        c2.collector.next(),
      ]);
      __jait_capture(1, (msg1.payload.broadcast));
      __jait_capture(2, (msg2.payload.broadcast));

      c1.ws.close();
      c2.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_457_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-streaming-broadcast");
      const otherToken = await createToken("other-streaming-user");
      const first = openWs(port, { token });
      const second = openWs(port, { token });
      const other = openWs(port, { token: otherToken });

      await Promise.all([waitForOpen(first.ws), waitForOpen(second.ws), waitForOpen(other.ws)]);
      await Promise.all([
        first.collector.next(),
        second.collector.next(),
        other.collector.next(),
      ]);

      plane.broadcastToUser("user-streaming-broadcast", {
        type: "session.streaming",
        sessionId: "background-session",
        timestamp: new Date().toISOString(),
        payload: { sessionId: "background-session", streaming: false },
      });

      const [firstUpdate, secondUpdate] = await Promise.all([
        first.collector.next(),
        second.collector.next(),
      ]);
      __jait_capture(1, (firstUpdate.payload));
      __jait_capture(2, (secondUpdate.payload));
      __jait_captureType(3, (await other.collector.maybeNext(500)));

      first.ws.close();
      second.ws.close();
      other.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_494_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-consent-approve");
      const onApprove = new Promise<string>((resolve) => {
        plane.onConsentApprove = (requestId) => resolve(requestId);
      });

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "consent.approve", requestId: "req-1" }));
      await __jait_captureResolved(1, (onApprove));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_510_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-consent-reject");
      const onReject = new Promise<{ requestId: string; reason?: string }>((resolve) => {
        plane.onConsentReject = (requestId, reason) => resolve({ requestId, reason });
      });

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "consent.reject", requestId: "req-2", reason: "No" }));
      await __jait_captureResolved(1, (onReject));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_528_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-screen-share");
      const screenShare = new ScreenShareService();
      for (const id of ["host-device", "viewer-device", "outsider-device"]) {
        screenShare.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
      }
      const session = screenShare.startShare({
        hostDeviceId: "host-device", viewerDeviceIds: ["viewer-device"],
        initiatedBy: "agent", requireConsent: true,
      });
      plane.screenShareSessionLookup = (id) => screenShare.getSession(id);
      const connect = async (deviceId: string) => {
        const client = openWs(port, { token });
        await waitForOpen(client.ws);
        await client.collector.next();
        client.ws.send(JSON.stringify({ type: "subscribe", sessionId: "chat", deviceId }));
        await client.collector.next();
        return client;
      };
      const host = await connect("host-device");
      const viewer = await connect("viewer-device");
      const outsider = await connect("outsider-device");
      const offer = (id = session.id) => JSON.stringify({ type: "screen-share:offer", payload: {
        sessionId: id, hostDeviceId: "host-device", sdp: "fake-sdp",
      } });
      try {
        host.ws.send(offer());
        __jait_captureType(1, (await viewer.collector.maybeNext(200))); // Await host consent.
        screenShare.resolveApproval(session.id, true);
        outsider.ws.send(offer());
        __jait_captureType(2, (await viewer.collector.maybeNext(200))); // A non-member cannot inject signals.
        host.ws.send(offer());
        const relayed = await viewer.collector.next();
        __jait_capture(3, (relayed.type));
        __jait_capture(4, (relayed.payload.sdp));
        __jait_captureType(5, (await host.collector.maybeNext(200)));
        __jait_captureType(6, (await outsider.collector.maybeNext(200)));
        host.ws.send(offer("unknown-session"));
        __jait_captureType(7, (await viewer.collector.maybeNext(200)));
        screenShare.stopShare(session.id);
        host.ws.send(offer());
        __jait_captureType(8, (await viewer.collector.maybeNext(200)));
      } finally {
        host.ws.close(); viewer.ws.close(); outsider.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_575_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-screen-share-lifecycle");
      const shares = new ScreenShareService();
      for (const id of ["host", "viewer", "outsider"]) {
        shares.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
      }
      const session = shares.startShare({
        hostDeviceId: "host", viewerDeviceIds: ["viewer"], chatId: "owned-chat",
        initiatedBy: "agent", requireConsent: true, reason: "Please share",
      });
      plane.screenShareSessionLookup = id => shares.getSession(id);
      plane.canAccessSession = (id, user) => id === "owned-chat" && user === "user-screen-share-lifecycle";
      // This case tests lifecycle scoping with an already-granted node.
      const permission = vi.spyOn(plane as unknown as { permissionDeniedError: () => Error | null }, "permissionDeniedError").mockReturnValue(null);
      const stopped = vi.fn();
      plane.onScreenShareStop = stopped;
      const connect = async (deviceId: string) => {
        const client = openWs(port, { token });
        await waitForOpen(client.ws);
        await client.collector.next();
        client.ws.send(JSON.stringify({ type: "subscribe", deviceId }));
        await client.collector.next();
        return client;
      };
      const host = await connect("host");
      const viewer = await connect("viewer");
      const outsider = await connect("outsider");
      try {
        const request = { type: "screen-share:start-request", payload: {
          sessionId: session.id, hostDeviceId: "host", initiatedBy: "user", requireConsent: false, chatId: "forged",
        } };
        outsider.ws.send(JSON.stringify(request));
        __jait_captureType(1, (await host.collector.maybeNext(100)));
        viewer.ws.send(JSON.stringify({ ...request, payload: { ...request.payload, sessionId: "unknown" } }));
        __jait_captureType(2, (await host.collector.maybeNext(100)));
        viewer.ws.send(JSON.stringify(request));
        const delivered = await host.collector.next();
        __jait_capture(3, (delivered.payload), ({
          sessionId: session.id, hostDeviceId: "host", viewerDeviceIds: ["viewer"],
          initiatedBy: "agent", requireConsent: true, chatId: "owned-chat",
        }));
        outsider.ws.send(JSON.stringify({ type: "screen-share:stop-request", payload: { sessionId: session.id } }));
        viewer.ws.send(JSON.stringify({ type: "screen-share:stop-request", payload: { sessionId: session.id } }));
        await new Promise(resolve => setTimeout(resolve, 100));
        __jait_capture(4, (stopped.mock.calls));
        host.ws.send(JSON.stringify({ type: "screen-share:stop-request", payload: { sessionId: session.id } }));
        await vi.waitFor(() => __jait_capture(5, (stopped.mock.calls), ([session.id])));
      } finally {
        permission.mockRestore();
        host.ws.close(); viewer.ws.close(); outsider.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_628_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const shares = new ScreenShareService();
      for (const id of ["host", "viewer"]) {
        shares.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
      }
      const session = shares.startShare({ hostDeviceId: "host", viewerDeviceIds: ["viewer"], chatId: "private" });
      plane.screenShareSessionLookup = id => shares.getSession(id);
      plane.canAccessSession = (id, user) => id === "private" && user === "alice";
      const connect = async (user: string, deviceId: string) => {
        const client = openWs(port, { token: await createToken(user) });
        await waitForOpen(client.ws);
        await client.collector.next();
        client.ws.send(JSON.stringify({ type: "subscribe", deviceId }));
        await client.collector.next();
        return client;
      };
      const host = await connect("alice", "host");
      const viewer = await connect("alice", "viewer");
      const attacker = await connect("bob", "viewer");
      try {
        host.ws.send(JSON.stringify({ type: "screen-share:offer", payload: {
          sessionId: session.id, hostDeviceId: "host", sdp: "offer",
        } }));
        __jait_capture(1, ((await viewer.collector.next()).payload.sdp));
        __jait_captureType(2, (await attacker.collector.maybeNext(100)));
        attacker.ws.send(JSON.stringify({ type: "screen-share:answer", payload: {
          sessionId: session.id, viewerDeviceId: "viewer", sdp: "forged",
        } }));
        __jait_captureType(3, (await host.collector.maybeNext(100)));
        plane.broadcastScreenShareState(session);
        __jait_capture(4, ((await viewer.collector.next()).type));
        __jait_capture(5, ((await host.collector.next()).type));
        __jait_captureType(6, (await attacker.collector.maybeNext(100)));
        plane.sendScreenShareStartRequest(session.id, "host", ["viewer"], { chatId: "private" });
        __jait_capture(7, ((await viewer.collector.next()).type));
        __jait_capture(8, ((await host.collector.next()).type));
        __jait_captureType(9, (await attacker.collector.maybeNext(100)));
      } finally {
        host.ws.close(); viewer.ws.close(); attacker.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_670_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-screen-share-peers");
      const shares = new ScreenShareService();
      for (const id of ["host", "viewer-a", "viewer-b", "outsider"]) {
        shares.registerDevice({ id, name: id, platform: "web", authorized: true, capabilities: [] });
      }
      const session = shares.startShare({ hostDeviceId: "host", viewerDeviceIds: ["viewer-a", "viewer-b"] });
      plane.screenShareSessionLookup = id => shares.getSession(id);
      const connect = async (deviceId: string) => {
        const client = openWs(port, { token });
        await waitForOpen(client.ws);
        await client.collector.next();
        client.ws.send(JSON.stringify({ type: "subscribe", deviceId }));
        await client.collector.next();
        return client;
      };
      const host = await connect("host");
      const a = await connect("viewer-a");
      const b = await connect("viewer-b");
      const outsider = await connect("outsider");
      try {
        const send = (client: typeof host, type: string, payload: Record<string, unknown>) =>
          client.ws.send(JSON.stringify({ type, payload: { sessionId: session.id, ...payload } }));
        send(host, "screen-share:offer", { hostDeviceId: "host", toDeviceId: "viewer-a", sdp: "offer-a" });
        __jait_capture(1, ((await a.collector.next()).payload.sdp));
        __jait_captureType(2, (await b.collector.maybeNext(100)));
        send(host, "screen-share:offer", { hostDeviceId: "host", sdp: "ambiguous" });
        send(host, "screen-share:offer", { hostDeviceId: "host", toDeviceId: "outsider", sdp: "invalid" });
        __jait_captureType(3, (await a.collector.maybeNext(100)));
        __jait_captureType(4, (await outsider.collector.maybeNext(100)));
        send(a, "screen-share:ice-candidate", { fromDeviceId: "viewer-a", candidate: "a-ice" });
        __jait_capture(5, ((await host.collector.next()).payload.candidate));
        __jait_captureType(6, (await b.collector.maybeNext(100)));
        send(host, "screen-share:ice-candidate", { fromDeviceId: "host", toDeviceId: "viewer-b", candidate: "b-ice" });
        __jait_capture(7, ((await b.collector.next()).payload.candidate));
        __jait_captureType(8, (await a.collector.maybeNext(100)));
      } finally {
        host.ws.close(); a.ws.close(); b.ws.close(); outsider.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_711_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-ui-state");
      const updatePromise = new Promise<{ sessionId: string; key: string; value: unknown | null; clientId: string }>((resolve) => {
        plane.onUIStateUpdate = (sessionId, key, value, clientId) => resolve({ sessionId, key, value, clientId });
      });

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      const connected = await collector.next();
      const connectedClientId = connected.payload.clientId;
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "ui-session-1", deviceId: "ui-device" }));
      await collector.next();

      ws.send(
        JSON.stringify({
          type: "ui.state",
          payload: {
            key: "jobs.drawer.open",
            value: false,
          },
        }),
      );

      await __jait_captureResolved(1, (updatePromise), ({
        sessionId: "ui-session-1",
        key: "jobs.drawer.open",
        value: false,
        clientId: connectedClientId,
      }));

      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_746_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-ui-isolation");
      const onUIStateUpdate = vi.fn();
      plane.onUIStateUpdate = onUIStateUpdate;

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((resolve) => setTimeout(resolve, 100));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "ui-session-a" }));
      await collector.next();

      ws.send(JSON.stringify({
        type: "ui.state",
        payload: {
          sessionId: "ui-session-b",
          key: "todo_list",
          value: [{ id: 1, title: "Wrong chat", status: "in-progress" }],
        },
      }));

      const rejection = await collector.next();
      __jait_capture(1, (rejection.type));
      __jait_capture(2, (rejection.payload.code));
      __jait_capture(3, (onUIStateUpdate.mock.calls));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_775_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("session-owner");
      plane.canAccessSession = (sessionId, userId) => (
        sessionId === "owned-session" && userId === "session-owner"
      );

      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((resolve) => setTimeout(resolve, 100));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "other-session" }));
      const rejection = await collector.next();
      __jait_capture(1, (rejection.type));
      __jait_capture(2, (rejection.payload.code));

      ws.send(JSON.stringify({ type: "subscribe", sessionId: "owned-session" }));
      const subscribed = await collector.next();
      __jait_capture(3, (subscribed.type));
      __jait_capture(4, (subscribed.sessionId));
      __jait_capture(5, (subscribed.payload.subscribed));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_799_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-sync");
      plane.onTerminalReplay = (terminalId) => (terminalId === "term-sync" ? "buffered prompt>" : null);

      const subscribed = openWs(port, { token });
      await waitForOpen(subscribed.ws);
      await subscribed.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      subscribed.ws.send(JSON.stringify({ type: "subscribe", sessionId: "term-session", deviceId: "term-a" }));
      await subscribed.collector.next();

      const observer = openWs(port, { token });
      await waitForOpen(observer.ws);
      await observer.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      observer.ws.send(JSON.stringify({ type: "subscribe", sessionId: "term-session", deviceId: "term-b" }));
      await observer.collector.next();

      subscribed.ws.send(JSON.stringify({ type: "terminal.subscribe", terminalId: "term-sync" }));
      const ack = await subscribed.collector.next();
      __jait_capture(1, (ack.type));
      __jait_capture(2, (ack.payload.subscribed));
      const replay = await subscribed.collector.next();
      __jait_capture(3, (replay.payload.data));
      __jait_capture(4, (replay.payload.streamId));
      __jait_capture(5, (replay.payload.seq));
      __jait_capture(6, (replay.payload.replay));

      plane.broadcastTerminalOutput("term-sync", "live output line", 7);

      const streamed = await subscribed.collector.next();
      __jait_capture(7, (streamed.payload.data));
      __jait_capture(8, (streamed.payload.streamId));
      __jait_capture(9, (streamed.payload.seq));
      __jait_capture(10, (streamed.payload.outputOffset));

      const noStream = await observer.collector.maybeNext(500);
      __jait_captureType(11, (noStream));

      subscribed.ws.close();
      observer.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_842_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-command-slice");
      plane.onTerminalReplay = ((terminalId: string, outputOffset?: number, outputEndOffset?: number) => {
        if (terminalId !== "term-command-slice") return null;
        return outputOffset === 2 && outputEndOffset === 4
          ? "current command output"
          : "older command output\ncurrent command output\nlater command output";
      }) as typeof plane.onTerminalReplay;

      const subscribed = openWs(port, { token });
      await waitForOpen(subscribed.ws);
      await subscribed.collector.next();
      await new Promise((resolve) => setTimeout(resolve, 100));
      subscribed.ws.send(JSON.stringify({ type: "subscribe", sessionId: "term-command-session" }));
      await subscribed.collector.next();

      subscribed.ws.send(JSON.stringify({
        type: "terminal.subscribe",
        terminalId: "term-command-slice",
        outputOffset: 2,
        outputEndOffset: 4,
      }));
      await subscribed.collector.next();
      const replay = await subscribed.collector.next();

      __jait_capture(1, (replay.payload.data));
      __jait_capture(2, (replay.payload.outputOffset));
      subscribed.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_872_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-devices");

      const authed = openWs(port, { token });
      await waitForOpen(authed.ws);
      await authed.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      authed.ws.send(JSON.stringify({ type: "subscribe", sessionId: "devices", deviceId: "device-auth" }));
      await authed.collector.next();

      const unauth = openWs(port);
      await waitForOpen(unauth.ws);
      await unauth.collector.next();
      unauth.ws.send(JSON.stringify({ type: "subscribe", sessionId: "devices", deviceId: "device-unauth" }));
      await unauth.collector.next();

      __jait_capture(1, (plane.getConnectedDeviceIds()));

      authed.ws.close();
      unauth.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_894_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-seq");

      const subscribed = openWs(port, { token });
      await waitForOpen(subscribed.ws);
      await subscribed.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      subscribed.ws.send(JSON.stringify({ type: "subscribe", sessionId: "term-seq-session", deviceId: "term-seq-device" }));
      await subscribed.collector.next();

      subscribed.ws.send(JSON.stringify({ type: "terminal.subscribe", terminalId: "term-seq" }));
      await subscribed.collector.next();

      plane.broadcastTerminalOutput("term-seq", "first");
      plane.broadcastTerminalOutput("term-seq", "second");

      const first = await subscribed.collector.next();
      const second = await subscribed.collector.next();

      __jait_capture(1, (first.payload.streamId));
      __jait_capture(2, (first.payload.seq));
      __jait_capture(3, (second.payload.streamId));
      __jait_capture(4, (second.payload.seq));

      subscribed.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_921_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-provider-stream");
      const received: Array<{ sessionId: string; event: unknown; metadata?: { streamId: string; seq: number } }> = [];
      plane.onRemoteProviderEvent = (sessionId, event, metadata) => {
        received.push({ sessionId, event, metadata });
      };

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      remote.ws.send(JSON.stringify({
        type: "provider.event",
        payload: { sessionId: "provider-session-1", event: { type: "turn.started", sessionId: "provider-session-1" } },
      }));
      remote.ws.send(JSON.stringify({
        type: "provider.event",
        payload: { sessionId: "provider-session-1", event: { type: "turn.completed", sessionId: "provider-session-1" } },
      }));

      await new Promise((r) => setTimeout(r, 100));

      __jait_capture(1, (received));
      __jait_capture(2, (received[0]?.metadata));
      __jait_capture(3, (received[1]?.metadata));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_951_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-tool-stream");

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "remote-tool-node", name: "Remote Tool Node", platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      await grantPermissions(remote, "remote-tool-node", { terminal: true });

      const chunks: Array<{ chunk: string; metadata?: { streamId: string; seq: number } }> = [];
      const resultPromise = plane.proxyToolOp<{ ok: boolean }>(
        "remote-tool-node",
        "terminal.exec",
        { command: "echo hi" },
        {
          sessionId: "tool-stream-session",
          projectRoot: "/tmp",
          onOutputChunk: (chunk, metadata) => {
            chunks.push({ chunk, metadata });
          },
        },
      );

      const nodeRegistered = await remote.collector.next();
      __jait_capture(1, (nodeRegistered.type));
      let request = await remote.collector.next();
      while (request.type === "node.updated") {
        request = await remote.collector.next();
      }
      __jait_capture(2, (request.type));
      const requestId = request.payload.requestId as string;

      remote.ws.send(JSON.stringify({
        type: "tool.op-output",
        payload: { requestId, chunk: "first\n" },
      }));
      remote.ws.send(JSON.stringify({
        type: "tool.op-output",
        payload: { requestId, chunk: "second\n" },
      }));
      remote.ws.send(JSON.stringify({
        type: "tool.op-response",
        payload: { requestId, result: { ok: true } },
      }));

      await __jait_captureResolved(3, (resultPromise));
      __jait_capture(4, (chunks), ([
        { chunk: "first\n", metadata: { streamId: `tool:${requestId}`, seq: 1 } },
        { chunk: "second\n", metadata: { streamId: `tool:${requestId}`, seq: 2 } },
      ]));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1012_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-stream");

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      remote.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "remote-terminal-node",
          name: "Remote Terminal Node",
          platform: "linux",
          role: "desktop",
          capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
        },
      }));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "remote-terminal-node", name: "Remote Terminal Node", platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      await grantPermissions(remote, "remote-terminal-node", { terminal: true });

      const outputEvents: Array<{ terminalId: string; data: string; nodeId?: string }> = [];
      plane.onRemoteTerminalOutput = (terminalId, data, nodeId) => {
        outputEvents.push({ terminalId, data, nodeId });
      };

      const resultPromise = plane.proxyTerminalOp<{ ok: boolean; pid: number; shell: string }>(
        "remote-terminal-node",
        "start",
        { terminalId: "term-remote", sessionId: "terminal-session", projectRoot: "/tmp", cols: 80, rows: 24 },
      );

      let request = await remote.collector.next();
      while (request.type !== "terminal.op-request") {
        __jait_capture(1, (["node.updated", "fs.node-registered", "nodes.permissions"]), (request.type));
        request = await remote.collector.next();
      }
      __jait_capture(2, (request.type));
      __jait_capture(3, (request.payload));
      const requestId = request.payload.requestId as string;

      remote.ws.send(JSON.stringify({
        type: "terminal.output",
        payload: { terminalId: "term-remote", data: "ready\\n" },
      }));
      remote.ws.send(JSON.stringify({
        type: "terminal.op-response",
        payload: { requestId, result: { ok: true, pid: 42, shell: "/bin/bash" } },
      }));

      await __jait_captureResolved(4, (resultPromise));
      __jait_capture(5, (outputEvents));

      plane.sendTerminalOp("remote-terminal-node", "input", { terminalId: "term-remote", data: "pwd\\r" });
      request = await remote.collector.next();
      __jait_capture(6, (request.type));
      __jait_capture(7, (request.payload));
      __jait_captureType(8, (request.payload.requestId));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1088_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-deny");

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      remote.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "deny-node",
          name: "Deny Node",
          platform: "linux",
          role: "desktop",
          capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
        },
      }));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "deny-node", name: "Deny Node", platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      // No grants were configured — terminal must be rejected, not dispatched.
      await __jait_rejected(1, plane.proxyTerminalOp("deny-node", "start", { cols: 80, rows: 24 }));

      // No terminal.op-request was ever forwarded to the node (skip unrelated broadcasts).
      const forwarded = await remote.collector.maybeNext(150);
      __jait_capture(2, (forwarded && forwarded.type));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1124_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-provider-deny");

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      remote.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "agent-deny-node",
          name: "Agent Deny Node",
          platform: "win32",
          role: "desktop",
          capabilities: { providers: ["cli"], surfaces: [], tools: [], interactiveTerminal: false },
        },
      }));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "agent-deny-node", name: "Agent Deny Node", platform: "win32", providers: ["cli"] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      // No grants were configured — starting a CLI agent session on this node
      // (which would give full device access) must be rejected, not dispatched.
      await __jait_rejected(1, plane.proxyProviderOp("agent-deny-node", "start-session", {
          provider: "cli",
          model: "gpt-4o",
          projectRoot: "C:\\\\Users\\\\me\\\\proj",
        }));

      // send-turn and stop-session are gated too.
      await __jait_rejected(2, plane.proxyProviderOp("agent-deny-node", "send-turn", { sessionId: "s1", message: "hi" }));
      await __jait_rejected(3, plane.proxyProviderOp("agent-deny-node", "stop-session", { sessionId: "s1" }));
      await __jait_rejected(4, plane.proxyProviderOp("agent-deny-node", "update", { providerId: "codex", providerType: "codex" }));

      // No provider.op-request was ever forwarded to the node.
      const forwarded = await remote.collector.maybeNext(150);
      __jait_capture(5, (forwarded && forwarded.type));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1176_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-perms");

      const admin = openWs(port, { token });
      await waitForOpen(admin.ws);
      await admin.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      admin.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "roundtrip-node",
          name: "Roundtrip Node",
          platform: "darwin",
          role: "desktop",
          capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
        },
      }));
      admin.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "roundtrip-node", name: "Roundtrip Node", platform: "darwin", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      // Initially deny-all.
      admin.ws.send(JSON.stringify({ type: "nodes.list" }));
      let snap = await nextNodesPermissions(admin);
      let node = snap.payload.nodes.find((n: any) => n.id === "roundtrip-node");
      __jait_capture(1, (node.permissions.terminal));
      __jait_capture(2, (node.permissions.filesystem));

      // Grant terminal + filesystem.
      admin.ws.send(JSON.stringify({
        type: "nodes.update-permissions",
        payload: { nodeId: "roundtrip-node", grants: { terminal: true, filesystem: true } },
      }));
      // Broadcast arrives after the update is applied. Skip stale queued
      // snapshots (the nodes.list response) until we see the persisted grants.
      for (;;) {
        snap = await nextNodesPermissions(admin);
        node = snap.payload.nodes.find((n: any) => n.id === "roundtrip-node");
        if (node?.permissions?.terminal) break;
      }
      __jait_capture(3, (node.permissions.terminal));
      __jait_capture(4, (node.permissions.filesystem));
      __jait_capture(5, (node.permissions.screen));

      admin.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1226_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-forget-node");
      const nodeClient = openWs(port, { token });
      await waitForOpen(nodeClient.ws);
      await nodeClient.collector.next();
      const admin = openWs(port, { token });
      await waitForOpen(admin.ws);
      await admin.collector.next();

      nodeClient.ws.send(JSON.stringify({
        type: "node.hello",
        payload: { id: "forget-node", name: "Forget Node", platform: "android", role: "remote" },
      }));
      await new Promise((r) => setTimeout(r, 50));
      admin.ws.send(JSON.stringify({ type: "nodes.forget", payload: { nodeId: "forget-node" } }));
      let onlineError: any;
      for (;;) {
        onlineError = await admin.collector.next();
        if (onlineError.type === "error") break;
      }
      __jait_capture(1, (onlineError.payload.code));

      nodeClient.ws.close();
      await new Promise((r) => setTimeout(r, 50));
      admin.ws.send(JSON.stringify({ type: "nodes.forget", payload: { nodeId: "forget-node" } }));
      for (;;) {
        const snapshot = await nextNodesPermissions(admin);
        if (!snapshot.payload.nodes.some((node: any) => node.id === "forget-node")) break;
      }
      admin.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1258_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-top-level-perms");

      const client = openWs(port, { token });
      await waitForOpen(client.ws);
      await client.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      client.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "top-level-node",
          name: "Top Level Node",
          platform: "darwin",
          role: "desktop",
          capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
        },
      }));
      client.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "top-level-node", name: "Top Level Node", platform: "darwin", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      // The web hook historically sent nodeId/grants at the TOP level (not nested
      // in `payload`). The handler must accept that shape too.
      client.ws.send(JSON.stringify({
        type: "nodes.update-permissions",
        nodeId: "top-level-node",
        grants: { terminal: true, filesystem: true },
      }));

      // Verify via the nodes.permissions broadcast that the grants were applied.
      let snap: any;
      for (;;) {
        snap = await nextNodesPermissions(client);
        const node = snap.payload.nodes.find((n: any) => n.id === "top-level-node");
        if (node?.permissions?.terminal) break;
      }
      const applied = snap.payload.nodes.find((n: any) => n.id === "top-level-node");
      __jait_capture(1, (applied.permissions.terminal));
      __jait_capture(2, (applied.permissions.filesystem));
      __jait_capture(3, (applied.permissions.screen));

      // No BAD_REQUEST was emitted for this message.
      const err = await client.collector.maybeNext(150);
      __jait_capture(4, (err && err.type));

      client.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1309_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-terminal-nocap");

      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      // Advertise a "terminal" surface but NOT interactiveTerminal — simulates
      // an older desktop build that ignores terminal.op-request.
      remote.ws.send(JSON.stringify({
        type: "node.hello",
        payload: {
          id: "remote-terminal-legacy",
          name: "Legacy Terminal Node",
          platform: "linux",
          role: "desktop",
          capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [] },
        },
      }));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: "remote-terminal-legacy", name: "Legacy Terminal Node", platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));

      await grantPermissions(remote, "remote-terminal-legacy", { terminal: true });

      await __jait_rejected(1, plane.proxyTerminalOp("remote-terminal-legacy", "start", {
          terminalId: "term-legacy",
          sessionId: "s",
          projectRoot: "/tmp",
        }));

      remote.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1348_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-reconnect");

      const first = openWs(port, { token });
      await waitForOpen(first.ws);
      await first.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      first.ws.send(JSON.stringify({ type: "subscribe", sessionId: "reconnect", deviceId: "device-r1" }));
      await first.collector.next();
      __jait_capture(1, (plane.getConnectedDeviceIds()));

      first.ws.close();
      await new Promise((r) => setTimeout(r, 150));

      const second = openWs(port, { token });
      await waitForOpen(second.ws);
      await second.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      second.ws.send(JSON.stringify({ type: "subscribe", sessionId: "reconnect", deviceId: "device-r1" }));
      await second.collector.next();

      __jait_capture(2, (plane.getConnectedDeviceIds()));
      second.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1373_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-surface-registry");
      plane.getSurfaceSnapshot = () => ({
        serverTime: new Date().toISOString(),
        surfaces: [
          {
            id: "surface-1",
            type: "terminal",
            state: "running",
            sessionId: "session-1",
            metadata: { projectRoot: "/tmp/project" },
          },
        ],
      });

      const client = openWs(port, { token });
      await waitForOpen(client.ws);
      await client.collector.next();
      await new Promise((r) => setTimeout(r, 100));

      client.ws.send(JSON.stringify({
        type: "resource.subscribe",
        payload: { resource: "root:/surfaces" },
      }));

      const registry = await client.collector.next();
      __jait_capture(1, (registry.type));
      __jait_capture(2, (Array.isArray(registry.payload.surfaces)));
      __jait_capture(3, (registry.payload.surfaces));
      __jait_capture(4, (registry.payload.surfaces[0]?.id));
      client.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1406_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("approval-owner");
      plane.canAccessSession = (sessionId, userId) => sessionId === "owned" && userId === "approval-owner";
      plane.getPendingConsents = () => [{ id: "request-1", sessionId: "owned" }, { id: "private", sessionId: "other-user" }];
      const client = openWs(port, { token });
      await waitForOpen(client.ws);
      await client.collector.next();
      await new Promise((resolve) => setTimeout(resolve, 100));
      const subscribe = () => client.ws.send(JSON.stringify({ type: "resource.subscribe", payload: { resource: "root:/pending-consents" } }));
      subscribe();
      const snapshot = await client.collector.next();
      __jait_capture(1, (snapshot.type));
      __jait_capture(2, (snapshot.payload));
      plane.getPendingConsents = () => [];
      subscribe();
      __jait_capture(3, ((await client.collector.next()).payload));
      client.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1425_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{
      const token = await createToken("user-streaming-sessions");
      plane.getStreamingSessionIds = (userId) => (
        userId === "user-streaming-sessions" ? [] : ["wrong-user-session"]
      );

      const client = openWs(port, { token });
      await waitForOpen(client.ws);
      await client.collector.next();
      await new Promise((resolve) => setTimeout(resolve, 100));

      client.ws.send(JSON.stringify({
        type: "resource.subscribe",
        payload: { resource: "root:/streaming-sessions" },
      }));

      const snapshot = await client.collector.next();
      __jait_capture(1, (snapshot.type));
      __jait_capture(2, (snapshot.payload));
      client.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1446_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-auth-race");
      const client = openWs(port);
      await waitForOpen(client.ws);
      await client.collector.next();

      client.ws.send(JSON.stringify({ type: "subscribe", sessionId: "race-session", deviceId: "race-device" }));
      const unauthorized = await client.collector.next();
      __jait_capture(1, (unauthorized.type));
      __jait_capture(2, (unauthorized.payload.code));

      client.ws.send(JSON.stringify({ type: "authenticate", token }));
      const authenticated = await client.collector.next();
      __jait_capture(3, (authenticated.type));
      __jait_capture(4, (authenticated.payload.authenticated));

      client.ws.send(JSON.stringify({ type: "subscribe", sessionId: "race-session", deviceId: "race-device" }));
      const subscribed = await client.collector.next();
      __jait_capture(5, (subscribed.type));
      __jait_capture(6, (subscribed.payload.subscribed));

      client.ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1491_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
async function connectNode(user: string, nodeId: string) {
      const token = await createToken(user);
      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: nodeId, name: nodeId, platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));
      await grantPermissions(remote, nodeId, { terminal: true });
      return remote;
    }
await __jait_hook_5762();
try {
await (async()=>{

      const remote = await connectNode("user-bg-ok", "bg-node");
      const completions: BackgroundCommandResult[] = [];
      const unregister = backgroundCommandMonitor.setCompletionHandler((r) => {
        completions.push(r);
      });

      try {
        const backgroundId = plane.registerRemoteBackgroundCommand({
          nodeId: "bg-node",
          sessionId: "chat-session-1",
          command: "npm test",
        });

        remote.ws.send(JSON.stringify({
          type: "tool.background-complete",
          payload: { backgroundId, exitCode: 1, output: "3 failing" },
        }));
        await new Promise((r) => setTimeout(r, 100));

        __jait_capture(1, (completions));
        // The session comes from the gateway's own registration, never the node.
        __jait_capture(2, (completions[0]));
      } finally {
        unregister();
        remote.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1525_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
async function connectNode(user: string, nodeId: string) {
      const token = await createToken(user);
      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: nodeId, name: nodeId, platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));
      await grantPermissions(remote, nodeId, { terminal: true });
      return remote;
    }
await __jait_hook_5762();
try {
await (async()=>{

      const remote = await connectNode("user-bg-unknown", "bg-node-2");
      const completions: BackgroundCommandResult[] = [];
      const unregister = backgroundCommandMonitor.setCompletionHandler((r) => {
        completions.push(r);
      });

      try {
        const backgroundId = plane.registerRemoteBackgroundCommand({
          nodeId: "bg-node-2",
          sessionId: "chat-session-2",
          command: "npm test",
        });

        remote.ws.send(JSON.stringify({
          type: "tool.background-complete",
          payload: { backgroundId: "never-registered", exitCode: 0, output: "x" },
        }));
        // A replayed completion must not fire the handler twice.
        remote.ws.send(JSON.stringify({
          type: "tool.background-complete",
          payload: { backgroundId, exitCode: 0, output: "done" },
        }));
        remote.ws.send(JSON.stringify({
          type: "tool.background-complete",
          payload: { backgroundId, exitCode: 0, output: "done again" },
        }));
        await new Promise((r) => setTimeout(r, 100));

        __jait_capture(1, (completions));
        __jait_capture(2, (completions[0]?.output));
      } finally {
        unregister();
        remote.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1562_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
async function connectNode(user: string, nodeId: string) {
      const token = await createToken(user);
      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: nodeId, name: nodeId, platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));
      await grantPermissions(remote, nodeId, { terminal: true });
      return remote;
    }
await __jait_hook_5762();
try {
await (async()=>{

      const owner = await connectNode("user-bg-owner", "bg-owner");
      const intruder = await connectNode("user-bg-intruder", "bg-intruder");
      const completions: BackgroundCommandResult[] = [];
      const unregister = backgroundCommandMonitor.setCompletionHandler((r) => {
        completions.push(r);
      });

      try {
        const backgroundId = plane.registerRemoteBackgroundCommand({
          nodeId: "bg-owner",
          sessionId: "chat-session-3",
          command: "deploy",
        });

        intruder.ws.send(JSON.stringify({
          type: "tool.background-complete",
          payload: { backgroundId, exitCode: 0, output: "spoofed" },
        }));
        await new Promise((r) => setTimeout(r, 100));

        __jait_capture(1, (completions));
      } finally {
        unregister();
        owner.ws.close();
        intruder.ws.close();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1591_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
async function connectNode(user: string, nodeId: string) {
      const token = await createToken(user);
      const remote = openWs(port, { token });
      await waitForOpen(remote.ws);
      await remote.collector.next();
      await new Promise((r) => setTimeout(r, 100));
      remote.ws.send(JSON.stringify({
        type: "fs.register-node",
        payload: { id: nodeId, name: nodeId, platform: "linux", providers: [] },
      }));
      await new Promise((r) => setTimeout(r, 50));
      await grantPermissions(remote, nodeId, { terminal: true });
      return remote;
    }
await __jait_hook_5762();
try {
await (async()=>{

      const remote = await connectNode("user-bg-drop", "bg-node-3");
      const completions: BackgroundCommandResult[] = [];
      const unregister = backgroundCommandMonitor.setCompletionHandler((r) => {
        completions.push(r);
      });

      try {
        plane.registerRemoteBackgroundCommand({
          nodeId: "bg-node-3",
          sessionId: "chat-session-4",
          command: "npm test",
        });

        remote.ws.close();
        await new Promise((r) => setTimeout(r, 150));

        __jait_capture(1, (completions));
        __jait_capture(2, ((plane as any).remoteBackgroundCommands.size));
      } finally {
        unregister();
      }
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1617_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-err");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send("not valid json{{{");
      const msg = await collector.next();
      __jait_capture(1, (msg.type));
      __jait_capture(2, (msg.payload.message));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_ws_test_ts_1631_5": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const { ScreenShareService } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@jait/screen-share", __jait_original_dir):__jait_require.resolve("@jait/screen-share")));
const TEST_SECRET = "test-jwt-secret-for-ws-tests";
function makeConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    port: 0,
    wsPort: 0,
    host: "127.0.0.1",
    logLevel: "silent",
    corsOrigin: "*",
    nodeEnv: "test",
    jwtSecret: TEST_SECRET,
    ollamaUrl: "http://localhost:11434",
    ollamaModel: "test",
    ...overrides,
  };
}
async function createToken(
  sub: string,
  secret = TEST_SECRET,
): Promise<string> {
  const key = new TextEncoder().encode(secret);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];

  ws.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) {
      waiter(parsed);
    } else {
      queue.push(parsed);
    }
  });

  return {
    /** Get the next message, waiting up to `ms` milliseconds */
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          reject(new Error("WS message timeout"));
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Check if a message arrives within `ms` — returns null if not */
    async maybeNext(ms = 500): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => { clearTimeout(timer); resolve(msg); };
        const timer = setTimeout(() => {
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
    /** Shallow copy of the messages currently queued (no blocking) */
    peekAll(): unknown[] {
      return [...queue];
    },
    /** Remove and return the message at `index` from the queue */
    removeAt(index: number): unknown {
      return queue.splice(index, 1)[0];
    },
  };
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function openWs(port: number, opts?: { token?: string; headers?: Record<string, string> }) {
  const url = opts?.token
    ? `ws://127.0.0.1:${port}?token=${opts.token}`
    : `ws://127.0.0.1:${port}`;
  const ws = new WebSocket(url, { headers: opts?.headers });
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
async function grantPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
  nodeId: string,
  grants: Record<string, boolean>,
): Promise<void> {
  remote.ws.send(
    JSON.stringify({ type: "nodes.update-permissions", payload: { nodeId, grants } }),
  );
  // Wait until a `nodes.permissions` broadcast reflecting the applied grants is
  // queued. The update is processed synchronously, but a stale snapshot (e.g.
  // from node registration) may already be queued, so we scan the queue for the
  // target node's updated grant values. Stale snapshots for the target node are
  // removed so the loop makes progress; all unrelated messages (fs.node-registered,
  // node.updated, …) are left untouched for the rest of the test to consume.
  for (;;) {
    const queue = remote.collector.peekAll();
    let madeProgress = false;
    for (let i = 0; i < queue.length; i++) {
      const msg = queue[i] as any;
      if (msg.type !== "nodes.permissions") continue;
      const node = (msg.payload?.nodes ?? []).find(
        (n: any) => n.id === nodeId || n.nodeId === nodeId,
      );
      if (!node) continue;
      const perms = node.permissions ?? node;
      const matches = Object.entries(grants).every(
        ([cap, expected]) => perms[cap] === expected,
      );
      remote.collector.removeAt(i);
      if (matches) return;
      // Stale snapshot for the target node — drop it and re-scan.
      madeProgress = true;
      break;
    }
    if (!madeProgress) await new Promise((r) => setTimeout(r, 30));
  }
}
async function nextNodesPermissions(
  remote: { ws: WebSocket; collector: ReturnType<typeof createMessageCollector> },
): Promise<any> {
  for (;;) {
    const msg = await remote.collector.next(3000);
    if (msg.type === "nodes.permissions") return msg;
  }
}
/*__jait_scope_open__*/{
let plane: WsControlPlane;
let port: number;
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
const __jait_hook_5762 = async () => {
    const config = makeConfig({ wsPort: 0 });
    const opened = await openDatabase(":memory:");
    db = opened.db;
    migrateDatabase(opened.sqlite);
    plane = new WsControlPlane(config, db);
    plane.canAccessTerminal = (_id, user) => Boolean(user);
    plane.canAccessConsent = (_id, user) => Boolean(user);
    plane.start();
    const addr = (plane as any).wss?.address();
    port = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (port));
  };
const __jait_hook_8506 = () => {
    plane.stop();
  };
/*__jait_scope_open__*/{
await __jait_hook_5762();
try {
await (async()=>{

      const token = await createToken("user-unk");
      const { ws, collector } = openWs(port, { token });
      await waitForOpen(ws);
      await collector.next();
      await new Promise((r) => setTimeout(r, 100));

      ws.send(JSON.stringify({ type: "nonexistent.action" }));
      const msg = await collector.next();
      __jait_capture(1, (msg.type));
      __jait_capture(2, (msg.payload.message));
      ws.close();
    
})();

} finally {
await __jait_hook_8506();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
