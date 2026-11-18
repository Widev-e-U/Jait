// Translated fixture from packages/gateway/src/routes/projects-ws-sync.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/projects-ws-sync.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_projects_ws_sync_test_ts_145_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function createMessageCollector(socket: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    async maybeNext(ms = 400): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          // Drop our waiter again — leaving it queued would make it swallow
          // the next message instead of letting it reach the queue.
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}
async function connectClient(port: number, token: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(socket);
  await waitForOpen(socket);
  // Drain the initial `session.created` handshake ack — unrelated to app events.
  await collector.next();
  return { socket, collector };
}
async function nextAppEvent(collector: ReturnType<typeof createMessageCollector>, ms = 3000): Promise<any> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const msg = await collector.next(ms);
    if (typeof msg?.type === "string" && (msg.type.startsWith("project.") || msg.type.startsWith("chat."))) {
      return msg;
    }
  }
  throw new Error("Timed out waiting for a project./chat. WS event");
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let ws: WsControlPlane;
let wsPort: number;
let userService: UserService;
const __jait_hook_3961 = async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    ws = new WsControlPlane(testConfig);
    ws.start();
    const addr = (ws as any).wss?.address();
    wsPort = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (wsPort));

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      userService,
      audit,
      ws,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const httpAddr = app.server.address();
    address = typeof httpAddr === "string" ? httpAddr : `http://127.0.0.1:${httpAddr?.port}`;
  };
const __jait_hook_4866 = async () => {
    ws.stop();
    await app.close();
  };
await __jait_hook_3961();
try {
await (async()=>{

    const userA = userService.createUser(`sync-user-a-${Date.now()}`, "password123");
    const userB = userService.createUser(`sync-user-b-${Date.now()}`, "password123");
    const tokenA1 = await signAuthToken({ id: userA.id, username: userA.username }, testConfig.jwtSecret);
    const tokenA2 = await signAuthToken({ id: userA.id, username: userA.username }, testConfig.jwtSecret);
    const tokenB = await signAuthToken({ id: userB.id, username: userB.username }, testConfig.jwtSecret);

    const clientA1 = await connectClient(wsPort, tokenA1);
    const clientA2 = await connectClient(wsPort, tokenA2);
    const clientB = await connectClient(wsPort, tokenB);

    const headersA = await authHeaders(userA.id, userA.username, testConfig.jwtSecret);
    const createRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headersA, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Live Sync Project", rootPath: "/repo/live-sync" }),
    });
    __jait_capture(1, (createRes.status));
    const project = await createRes.json() as { id: string; title: string };

    // The creating client's own tab also receives its broadcast (dedupe is the frontend's job).
    const eventA1 = await nextAppEvent(clientA1.collector);
    __jait_capture(2, (eventA1.type));
    __jait_capture(3, (eventA1.payload.project.id), (project.id));
    __jait_capture(4, (eventA1.payload.project.title));

    // A second device signed in as the same user sees it too.
    const eventA2 = await nextAppEvent(clientA2.collector);
    __jait_capture(5, (eventA2.type));
    __jait_capture(6, (eventA2.payload.project.id), (project.id));

    // A different user must never see it.
    const leaked = await clientB.collector.maybeNext(500);
    __jait_captureType(7, (leaked));

    // Renaming the project broadcasts project.updated with the new title.
    const patchRes = await fetch(`${address}/api/projects/${project.id}`, {
      method: "PATCH",
      headers: { ...headersA, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Renamed Project" }),
    });
    __jait_capture(8, (patchRes.status));

    const updateEvent = await nextAppEvent(clientA2.collector);
    __jait_capture(9, (updateEvent.type));
    __jait_capture(10, (updateEvent.payload.project.title));

    clientA1.socket.close();
    clientA2.socket.close();
    clientB.socket.close();
  
})();

} finally {
await __jait_hook_4866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_ws_sync_test_ts_197_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function createMessageCollector(socket: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    async maybeNext(ms = 400): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          // Drop our waiter again — leaving it queued would make it swallow
          // the next message instead of letting it reach the queue.
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}
async function connectClient(port: number, token: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(socket);
  await waitForOpen(socket);
  // Drain the initial `session.created` handshake ack — unrelated to app events.
  await collector.next();
  return { socket, collector };
}
async function nextAppEvent(collector: ReturnType<typeof createMessageCollector>, ms = 3000): Promise<any> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const msg = await collector.next(ms);
    if (typeof msg?.type === "string" && (msg.type.startsWith("project.") || msg.type.startsWith("chat."))) {
      return msg;
    }
  }
  throw new Error("Timed out waiting for a project./chat. WS event");
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let ws: WsControlPlane;
let wsPort: number;
let userService: UserService;
const __jait_hook_3961 = async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    ws = new WsControlPlane(testConfig);
    ws.start();
    const addr = (ws as any).wss?.address();
    wsPort = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (wsPort));

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      userService,
      audit,
      ws,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const httpAddr = app.server.address();
    address = typeof httpAddr === "string" ? httpAddr : `http://127.0.0.1:${httpAddr?.port}`;
  };
const __jait_hook_4866 = async () => {
    ws.stop();
    await app.close();
  };
await __jait_hook_3961();
try {
await (async()=>{

    const user = userService.createUser(`sync-chat-user-${Date.now()}`, "password123");
    const tokenSelf = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const tokenOther = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const clientSelf = await connectClient(wsPort, tokenSelf);
    const clientOther = await connectClient(wsPort, tokenOther);
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Chat Sync Project" }),
    });
    const project = await projectRes.json() as { id: string };
    // Drain the project.created broadcast from both sockets before moving on.
    await nextAppEvent(clientSelf.collector);
    await nextAppEvent(clientOther.collector);

    // Create the project's FIRST (and only) chat — this is the exact scenario
    // that used to be invisible in the sidebar due to the `> 1` bug.
    const createSessionRes = await fetch(`${address}/api/projects/${project.id}/sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "First chat" }),
    });
    __jait_capture(1, (createSessionRes.status));
    const session = await createSessionRes.json() as { id: string; name: string };

    const createdEvent = await nextAppEvent(clientOther.collector);
    __jait_capture(2, (createdEvent.type));
    __jait_capture(3, (createdEvent.payload.projectId), (project.id));
    __jait_capture(4, (createdEvent.payload.session.id), (session.id));
    __jait_capture(5, (createdEvent.payload.session.name));

    // Rename via /api/sessions/:id
    const renameRes = await fetch(`${address}/api/sessions/${session.id}`, {
      method: "PATCH",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Renamed chat" }),
    });
    __jait_capture(6, (renameRes.status));
    const updatedEvent = await nextAppEvent(clientOther.collector);
    __jait_capture(7, (updatedEvent.type));
    __jait_capture(8, (updatedEvent.payload.projectId), (project.id));
    __jait_capture(9, (updatedEvent.payload.session.name));

    // Archive
    const archiveRes = await fetch(`${address}/api/sessions/${session.id}/archive`, {
      method: "POST",
      headers,
    });
    __jait_capture(10, (archiveRes.status));
    const archivedEvent = await nextAppEvent(clientOther.collector);
    __jait_capture(11, (archivedEvent.type));
    __jait_capture(12, (archivedEvent.payload.sessionId), (session.id));
    __jait_capture(13, (archivedEvent.payload.projectId), (project.id));

    // Create a standalone (project-less) chat and hard-delete it.
    const personalRes = await fetch(`${address}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Personal chat" }),
    });
    const personal = await personalRes.json() as { id: string };
    const personalCreatedEvent = await nextAppEvent(clientOther.collector);
    __jait_capture(14, (personalCreatedEvent.type));
    __jait_captureType(15, (personalCreatedEvent.payload.projectId));

    const deleteRes = await fetch(`${address}/api/sessions/${personal.id}`, {
      method: "DELETE",
      headers,
    });
    __jait_capture(16, (deleteRes.status));
    const deletedEvent = await nextAppEvent(clientOther.collector);
    __jait_capture(17, (deletedEvent.type));
    __jait_capture(18, (deletedEvent.payload.sessionId), (personal.id));
    __jait_captureType(19, (deletedEvent.payload.projectId));

    clientSelf.socket.close();
    clientOther.socket.close();
  
})();

} finally {
await __jait_hook_4866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_ws_sync_test_ts_279_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function createMessageCollector(socket: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    async maybeNext(ms = 400): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          // Drop our waiter again — leaving it queued would make it swallow
          // the next message instead of letting it reach the queue.
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}
async function connectClient(port: number, token: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(socket);
  await waitForOpen(socket);
  // Drain the initial `session.created` handshake ack — unrelated to app events.
  await collector.next();
  return { socket, collector };
}
async function nextAppEvent(collector: ReturnType<typeof createMessageCollector>, ms = 3000): Promise<any> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const msg = await collector.next(ms);
    if (typeof msg?.type === "string" && (msg.type.startsWith("project.") || msg.type.startsWith("chat."))) {
      return msg;
    }
  }
  throw new Error("Timed out waiting for a project./chat. WS event");
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let ws: WsControlPlane;
let wsPort: number;
let userService: UserService;
const __jait_hook_3961 = async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    ws = new WsControlPlane(testConfig);
    ws.start();
    const addr = (ws as any).wss?.address();
    wsPort = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (wsPort));

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      userService,
      audit,
      ws,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const httpAddr = app.server.address();
    address = typeof httpAddr === "string" ? httpAddr : `http://127.0.0.1:${httpAddr?.port}`;
  };
const __jait_hook_4866 = async () => {
    ws.stop();
    await app.close();
  };
await __jait_hook_3961();
try {
await (async()=>{

    const user = userService.createUser(`sync-move-user-${Date.now()}`, "password123");
    const stranger = userService.createUser(`sync-move-stranger-${Date.now()}`, "password123");
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const client = await connectClient(wsPort, token);
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const strangerHeaders = await authHeaders(stranger.id, stranger.username, testConfig.jwtSecret);

    const projectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Move Target", rootPath: "/repo/move-target" }),
    });
    const project = await projectRes.json() as { id: string };
    await nextAppEvent(client.collector); // project.created

    const personalRes = await fetch(`${address}/api/sessions`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Movable chat" }),
    });
    const personal = await personalRes.json() as { id: string };
    await nextAppEvent(client.collector); // chat.created

    // Personal → project: the chat adopts the project's root path.
    const moveIn = await fetch(`${address}/api/sessions/${personal.id}/move`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    __jait_capture(1, (moveIn.status));
    const moveInBody = await moveIn.json() as {
      moved: boolean;
      fromProjectId: string | null;
      session: { projectId: string | null; projectPath: string | null };
    };
    __jait_capture(2, (moveInBody.moved));
    __jait_captureType(3, (moveInBody.fromProjectId));
    __jait_capture(4, (moveInBody.session.projectId), (project.id));
    __jait_capture(5, (moveInBody.session.projectPath));

    const movedEvent = await nextAppEvent(client.collector);
    __jait_capture(6, (movedEvent.type));
    __jait_capture(7, (movedEvent.payload.sessionId), (personal.id));
    __jait_captureType(8, (movedEvent.payload.fromProjectId));
    __jait_capture(9, (movedEvent.payload.toProjectId), (project.id));
    __jait_capture(10, (movedEvent.payload.session.projectId), (project.id));

    // Moving to the same project again is a no-op and broadcasts nothing.
    const noop = await fetch(`${address}/api/sessions/${personal.id}/move`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: project.id }),
    });
    __jait_capture(11, (noop.status));
    __jait_capture(12, ((await noop.json() as { moved: boolean }).moved));
    __jait_captureType(13, (await client.collector.maybeNext(400)));

    // Project → personal chats: both projectId and projectPath are cleared.
    const moveOut = await fetch(`${address}/api/sessions/${personal.id}/move`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: null }),
    });
    __jait_capture(14, (moveOut.status));
    const moveOutBody = await moveOut.json() as {
      session: { projectId: string | null; projectPath: string | null };
    };
    __jait_captureType(15, (moveOutBody.session.projectId));
    __jait_captureType(16, (moveOutBody.session.projectPath));

    const movedOutEvent = await nextAppEvent(client.collector);
    __jait_capture(17, (movedOutEvent.type));
    __jait_capture(18, (movedOutEvent.payload.fromProjectId), (project.id));
    __jait_captureType(19, (movedOutEvent.payload.toProjectId));

    // A project belonging to somebody else is not a valid target.
    const strangerProjectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...strangerHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Not Yours" }),
    });
    const strangerProject = await strangerProjectRes.json() as { id: string };
    const foreign = await fetch(`${address}/api/sessions/${personal.id}/move`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: strangerProject.id }),
    });
    __jait_capture(20, (foreign.status));
    __jait_captureType(21, (await client.collector.maybeNext(400)));

    // A malformed target is rejected before anything is written.
    const invalid = await fetch(`${address}/api/sessions/${personal.id}/move`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ projectId: 42 }),
    });
    __jait_capture(22, (invalid.status));

    client.socket.close();
  
})();

} finally {
await __jait_hook_4866();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_ws_sync_test_ts_381_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function createMessageCollector(socket: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  socket.on("message", (raw) => {
    const parsed = JSON.parse(raw.toString());
    const waiter = waiters.shift();
    if (waiter) waiter(parsed);
    else queue.push(parsed);
  });
  return {
    next(ms = 3000): Promise<any> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("WS message timeout")), ms);
        waiters.push((msg) => {
          clearTimeout(timer);
          resolve(msg);
        });
      });
    },
    async maybeNext(ms = 400): Promise<any | null> {
      const queued = queue.shift();
      if (queued) return queued;
      return new Promise((resolve) => {
        const waiter = (msg: unknown) => {
          clearTimeout(timer);
          resolve(msg);
        };
        const timer = setTimeout(() => {
          // Drop our waiter again — leaving it queued would make it swallow
          // the next message instead of letting it reach the queue.
          const index = waiters.indexOf(waiter);
          if (index >= 0) waiters.splice(index, 1);
          resolve(null);
        }, ms);
        waiters.push(waiter);
      });
    },
  };
}
function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (socket.readyState === WebSocket.OPEN) return resolve();
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}
async function connectClient(port: number, token: string) {
  const socket = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(socket);
  await waitForOpen(socket);
  // Drain the initial `session.created` handshake ack — unrelated to app events.
  await collector.next();
  return { socket, collector };
}
async function nextAppEvent(collector: ReturnType<typeof createMessageCollector>, ms = 3000): Promise<any> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const msg = await collector.next(ms);
    if (typeof msg?.type === "string" && (msg.type.startsWith("project.") || msg.type.startsWith("chat."))) {
      return msg;
    }
  }
  throw new Error("Timed out waiting for a project./chat. WS event");
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let ws: WsControlPlane;
let wsPort: number;
let userService: UserService;
const __jait_hook_3961 = async () => {
    const opened = await openDatabase(":memory:");
    migrateDatabase(opened.sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    ws = new WsControlPlane(testConfig);
    ws.start();
    const addr = (ws as any).wss?.address();
    wsPort = typeof addr === "object" ? addr.port : 0;
    __jait_capture(0, (wsPort));

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      userService,
      audit,
      ws,
    });
    await app.listen({ port: 0, host: "127.0.0.1" });
    const httpAddr = app.server.address();
    address = typeof httpAddr === "string" ? httpAddr : `http://127.0.0.1:${httpAddr?.port}`;
  };
const __jait_hook_4866 = async () => {
    ws.stop();
    await app.close();
  };
await __jait_hook_3961();
try {
await (async()=>{

    const user = userService.createUser(`sync-restore-user-${Date.now()}`, "password123");
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const client = await connectClient(wsPort, token);
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await fetch(`${address}/api/projects`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ title: "Restorable Project" }),
    });
    const project = await projectRes.json() as { id: string };
    await nextAppEvent(client.collector); // project.created

    const deleteRes = await fetch(`${address}/api/projects/${project.id}`, {
      method: "DELETE",
      headers,
    });
    __jait_capture(1, (deleteRes.status));
    const deletedEvent = await nextAppEvent(client.collector);
    __jait_capture(2, (deletedEvent.type));
    __jait_capture(3, (deletedEvent.payload.projectId), (project.id));

    const restoreRes = await fetch(`${address}/api/projects/${project.id}/restore`, {
      method: "POST",
      headers,
    });
    __jait_capture(4, (restoreRes.status));
    const restoredEvent = await nextAppEvent(client.collector);
    __jait_capture(5, (restoredEvent.type));
    __jait_capture(6, (restoredEvent.payload.project.id), (project.id));

    client.socket.close();
  
})();

} finally {
await __jait_hook_4866();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
