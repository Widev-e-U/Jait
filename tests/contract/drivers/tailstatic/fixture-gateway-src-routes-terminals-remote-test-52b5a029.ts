// Translated fixture from packages/gateway/src/routes/terminals-remote.test.ts; expected literals are in tail_static.rs.


import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { ProjectStateService } from "../../../../packages/gateway/src/services/project-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { SurfaceRegistry, TerminalSurfaceFactory } from "../../../../packages/gateway/src/surfaces/index.js";
import { RemoteTerminalSurface } from "../../../../packages/gateway/src/surfaces/remote-terminal.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/terminals-remote.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_terminals_remote_test_ts_195_3": {

const { default: WebSocket } = await import((typeof Bun!=="undefined"?Bun.resolveSync("ws",__jait_original_dir):__jait_require.resolve("ws/package.json").replace(/package\.json$/,"wrapper.mjs")));
const jose = await import((typeof Bun!=="undefined"?Bun.resolveSync("jose", __jait_original_dir):__jait_require.resolve("jose")));
const TEST_SECRET = "test-jwt-secret-for-remote-terminal-tests";
function makeConfig(overrides: Record<string, unknown> = {}) {
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
async function createToken(sub: string): Promise<string> {
  const key = new TextEncoder().encode(TEST_SECRET);
  return new jose.SignJWT({ sub })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(key);
}
function waitForOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    if (ws.readyState === WebSocket.OPEN) return resolve();
    ws.once("open", resolve);
    ws.once("error", reject);
  });
}
function createMessageCollector(ws: WebSocket) {
  const queue: unknown[] = [];
  const waiters: Array<(msg: unknown) => void> = [];
  ws.on("message", (raw) => {
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
  };
}
function openWs(port: number, token: string) {
  const ws = new WebSocket(`ws://127.0.0.1:${port}?token=${token}`);
  const collector = createMessageCollector(ws);
  return { ws, collector };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let httpPort: number;
let surfaceRegistry: SurfaceRegistry;
let plane: WsControlPlane;
let token: string;
let remoteSessionId: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
const __jait_hook_3451 = async () => {
    const config = makeConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);

    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new TerminalSurfaceFactory());

    plane = new WsControlPlane(config, db);

    // Mirror the production wiring in index.ts so remote terminal output is
    // broadcast to subscribed clients and input/replay are forwarded.
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "terminal" && "write" in surface) {
        (surface as { onOutput?: (data: string) => void }).onOutput = (data) =>
          plane.broadcastTerminalOutput(id, data);
      }
    };

    plane.onRemoteTerminalOutput = (terminalId, data, nodeId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (!(surface instanceof RemoteTerminalSurface)) return;
      const ownerNodeId = surface.snapshot().metadata.nodeId;
      if (nodeId && ownerNodeId !== nodeId) return;
      surface.ingestOutput(data);
    };
    plane.onRemoteTerminalExit = (terminalId, exitCode, signal, nodeId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (!(surface instanceof RemoteTerminalSurface)) return;
      const ownerNodeId = surface.snapshot().metadata.nodeId;
      if (nodeId && ownerNodeId !== nodeId) return;
      surface.ingestExit(exitCode, signal);
    };
    plane.onTerminalInput = (terminalId, data) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "write" in surface) {
        (surface as { write: (d: string) => void }).write(data);
      }
    };
    plane.onTerminalReplay = (terminalId) => {
      const surface = surfaceRegistry.getSurface(terminalId);
      if (surface && surface.type === "terminal" && "getRecentOutput" in surface) {
        return (surface as { getRecentOutput: () => string }).getRecentOutput();
      }
      return null;
    };

    const audit: AuditWriter = { write() {} } as unknown as AuditWriter;
    const toolRegistry = new ToolRegistry();

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      surfaceRegistry,
      sessionState,
      projectService: projects,
      projectState,
      audit,
      toolRegistry,
      ws: plane,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    httpPort = typeof addr === "string" ? 0 : (addr?.port ?? 0);
    __jait_capture(0, (httpPort));

    // Attach the WS control plane to the same HTTP server (shared port).
    plane.start(app.server);

    const user = users.createUser("remote-terminal-test-user", "test-password-only");
    token = await new jose.SignJWT({ username: user.username }).setSubject(user.id)
      .setProtectedHeader({ alg: "HS256" }).setExpirationTime("1h").sign(new TextEncoder().encode(TEST_SECRET));
    const session = sessions.create({ userId: user.id, name: "remote terminal" });
    remoteSessionId = session.id;
  };
const __jait_hook_6855 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    plane.stop();
    await app?.close();
    sqlite?.close();
  };
await __jait_hook_3451();
try {
await (async()=>{

    const REMOTE_NODE_ID = "remote-terminal-node-int";

    // ── 1. Connect the remote node and register it ───────────────────
    const remote = openWs(httpPort, token);
    await waitForOpen(remote.ws);
    await remote.collector.next(); // session.created
    await new Promise((r) => setTimeout(r, 100));

    remote.ws.send(JSON.stringify({
      type: "node.hello",
      payload: {
        id: REMOTE_NODE_ID,
        name: "Remote Terminal Node",
        platform: "linux",
        role: "desktop",
        capabilities: { providers: [], surfaces: ["filesystem", "terminal"], tools: [], interactiveTerminal: true },
      },
    }));
    remote.ws.send(JSON.stringify({
      type: "fs.register-node",
      payload: { id: REMOTE_NODE_ID, name: "Remote Terminal Node", platform: "linux", providers: [] },
    }));
    // Drain registration broadcasts until the node is known to the plane.
    await new Promise((r) => setTimeout(r, 100));
    __jait_capture(1, (plane.isRemoteNode(REMOTE_NODE_ID)));

    // Grant terminal permission for the remote node (deny-by-default otherwise).
    remote.ws.send(JSON.stringify({
      type: "nodes.update-permissions",
      payload: { nodeId: REMOTE_NODE_ID, grants: { terminal: true } },
    }));
    await remote.collector.next(); // nodes.permissions

    // ── 2. Subscribe a second client that will watch terminal output ─
    const viewer = openWs(httpPort, token);
    await waitForOpen(viewer.ws);
    await viewer.collector.next(); // session.created
    await new Promise((r) => setTimeout(r, 100));

    // ── 3. POST /api/terminals with the remote nodeId ────────────────
    // The remote node must answer the proxied "start" op while the request
    // is in flight, so handle it concurrently.
    const startHandled = new Promise<void>((resolve) => {
      remote.ws.once("message", (raw) => {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "terminal.op-request" && msg.payload?.op === "start") {
          const requestId = msg.payload.requestId;
          // Emit some output from the remote node (forwarded via onRemoteTerminalOutput)
          remote.ws.send(JSON.stringify({
            type: "terminal.output",
            payload: { terminalId: msg.payload.terminalId, data: "shell ready\r\n" },
          }));
          // Answer the start op so the REST call resolves.
          remote.ws.send(JSON.stringify({
            type: "terminal.op-response",
            payload: { requestId, result: { ok: true, pid: 7, shell: "/bin/bash" } },
          }));
          resolve();
        }
      });
    });

    const createRes = await fetch(`http://127.0.0.1:${httpPort}/api/terminals`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ sessionId: remoteSessionId, projectRoot: "/tmp", nodeId: REMOTE_NODE_ID }),
    });

    await startHandled;

    __jait_capture(2, (createRes.ok));
    const info = (await createRes.json()) as { id: string; type: string; metadata: Record<string, unknown> };
    __jait_capture(3, (info.type));
    __jait_capture(4, (info.metadata.nodeId), (REMOTE_NODE_ID));
    __jait_capture(5, (info.metadata.remote));
    __jait_capture(6, (info.state));

    // ── 4. The viewer subscribes to the terminal and must receive output
    viewer.ws.send(JSON.stringify({ type: "terminal.subscribe", terminalId: info.id }));

    // surface.connected (subscribed ack) comes first, then the replayed buffer.
    // Poll until we've seen both the subscription ack and the output replay.
    let gotSubscribed = false;
    let gotOutput = false;
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline && !(gotSubscribed && gotOutput)) {
      const msg = await viewer.collector.next(Math.max(200, deadline - Date.now())).catch(() => null);
      if (!msg) break;
      if (msg.type === "surface.connected") {
        const p = msg.payload ?? {};
        if (p.subscribed === true) gotSubscribed = true;
        if (p.type === "terminal.output" && typeof p.data === "string" && p.data.includes("shell ready")) {
          gotOutput = true;
        }
      }
    }
    __jait_capture(7, (gotSubscribed));
    __jait_capture(8, (gotOutput));

    remote.ws.close();
    viewer.ws.close();
  
})();

} finally {
await __jait_hook_6855();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
