// Translated fixture from packages/gateway/src/routes/project-open.test.ts; expected literals are in tail_static.rs.
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { ProjectStateService } from "../../../../packages/gateway/src/services/project-state.js";
import { SurfaceRegistry, FileSystemSurfaceFactory } from "../../../../packages/gateway/src/surfaces/index.js";
import { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/project-open.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_128_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const access = vi.spyOn(ws, "canAccessNode").mockReturnValue(true);
    const res = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId, nodeId: "offline-node", strictNode: true }),
    });
    access.mockRestore();
    __jait_capture(0, (res.status));
    __jait_capture(1, ((await res.json() as { error: string }).error));
    __jait_capture(2, (surfaceRegistry.getBySession(sessionId).filter((s) => s.state === "running")));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_141_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const res = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });

    __jait_capture(0, (res.ok));
    const data = (await res.json()) as { surfaceId: string; projectRoot: string };
    __jait_capture(1, (data.surfaceId));
    __jait_capture(2, (data.projectRoot), (writableTestRoot));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_154_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    // First open the project
    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Now list the directory
    const listRes = await authedFetch(
      `${address}/api/project/list?path=${encodeURIComponent(writableTestRoot)}&surfaceId=${surfaceId}`,
    );

    __jait_capture(0, (listRes.ok));
    const listData = (await listRes.json()) as { path: string; entries: unknown[] };
    __jait_capture(1, (listData.path), (writableTestRoot));
    __jait_capture(2, (Array.isArray(listData.entries)));
    // ~/.jait should have at least the data directory
    __jait_capture(3, (listData.entries.length));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_176_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // Editor mode is opt-in, so the panel state only opens when requested.
      body: JSON.stringify({ path: writableTestRoot, sessionId, openPanel: true }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Check DB state
    const state = sessionState.get(sessionId, ["project.panel"]);
    __jait_capture(0, (state["project.panel"]), ({
      open: true,
      remotePath: writableTestRoot,
      surfaceId,
      nodeId: "gateway",
    }));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_195_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const user = users.createUser(`project-state-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: writableTestRoot,
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: writableTestRoot,
      name: "Current chat",
    });
    projectState.set(project.id, {
      "project.ui": {
        panel: { open: false, remotePath: writableTestRoot, surfaceId: "old-surface", nodeId: "gateway" },
        tabs: { remoteRoot: writableTestRoot, tabs: [], activePath: null, activePreview: null },
        layout: { tree: false, editor: true },
        terminal: { open: true },
        preview: null,
      },
    });

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });
    const { surfaceId, panelOpen } = (await openRes.json()) as { surfaceId: string; panelOpen: boolean };

    __jait_capture(0, (panelOpen));
    const state = projectState.get(project.id, ["project.ui"]);
    __jait_capture(1, (state["project.ui"]), ({
      panel: { open: false, remotePath: writableTestRoot, surfaceId, nodeId: "gateway" },
      tabs: { remoteRoot: writableTestRoot, tabs: [], activePath: null, activePreview: null },
      layout: { tree: false, editor: true },
      terminal: { open: true },
      preview: null,
    }));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_237_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const user = users.createUser(`project-explicit-open-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: writableTestRoot,
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: writableTestRoot,
      name: "Current chat",
    });
    projectState.set(project.id, {
      "project.ui": {
        panel: { open: false, remotePath: writableTestRoot, nodeId: "gateway" },
        tabs: null,
        layout: { tree: true, editor: false },
        terminal: null,
        preview: null,
      },
    });

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id, openPanel: true }),
    });
    const data = (await openRes.json()) as { surfaceId: string; panelOpen: boolean };

    __jait_capture(0, (data.panelOpen));
    const state = projectState.get(project.id, ["project.ui"]);
    __jait_capture(1, (state["project.ui"]), ({
      panel: { open: true, surfaceId: data.surfaceId },
      layout: { tree: true, editor: false },
    }));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_276_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const res = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/nonexistent/path/12345", sessionId }),
    });

    __jait_capture(0, (res.ok));
    __jait_capture(1, (res.status));
    const data = (await res.json()) as { error: string };
    __jait_capture(2, (data.error));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_289_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const applyRes = await authedFetch(`${address}/api/project/apply-diff`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "blocked", surfaceId }),
    });

    __jait_capture(0, (applyRes.status));
    const data = (await applyRes.json()) as { error: string };
    __jait_capture(1, (data.error));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_308_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const writeRes = await authedFetch(`${address}/api/project/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestFile, content: "after", surfaceId }),
    });

    __jait_capture(0, (writeRes.ok));
    await __jait_captureResolved(1, (readFile(writableTestFile, "utf-8")));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_326_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const user = users.findById(ownerId)!;
    const session = sessions.create({ userId: user.id, name: "No project yet" });
    __jait_captureType(0, (session.projectId));

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });

    __jait_capture(1, (openRes.ok));
    const data = (await openRes.json()) as { projectId: string | null; projectRoot: string };
    __jait_captureType(2, (data.projectId));
    __jait_capture(3, (data.projectRoot), (writableTestRoot));

    const updatedSession = sessions.getById(session.id, user.id);
    __jait_captureType(4, (updatedSession?.projectId));
    __jait_captureType(5, (updatedSession?.projectPath));
    __jait_captureType(6, (projects.findByRoot(writableTestRoot, "gateway", user.id)));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_348_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const searchFile = join(writableTestRoot, "nested", "unique-search-target.ts");
    await writeFile(searchFile, "const UNIQUE_SEARCH_TOKEN = 'project-search-regression';\n", "utf-8");

    const authResponse = await authedFetch(`${address}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        username: `project-search-${Date.now()}`,
        password: "password123",
        invitation: users.createInvitation(ownerId),
      }),
    });
    const { access_token: accessToken, user } = (await authResponse.json()) as {
      access_token: string;
      user: { id: string };
    };
    const searchHeaders = { Authorization: `Bearer ${accessToken}` };
    const searchSession = sessions.create({ userId: user.id, name: "Project search" });

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...searchHeaders },
      body: JSON.stringify({ path: writableTestRoot, sessionId: searchSession.id }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const unauthorizedSearch = await fetch(
      `${address}/api/project/search?query=unique-search-target&mode=files&surfaceId=${encodeURIComponent(surfaceId)}`,
    );
    __jait_capture(0, (unauthorizedSearch.status));

    const fileSearchRes = await authedFetch(
      `${address}/api/project/search?query=${encodeURIComponent("unique-search-target")}&mode=files&surfaceId=${encodeURIComponent(surfaceId)}`,
      { headers: searchHeaders },
    );
    __jait_capture(1, (fileSearchRes.ok));
    const fileSearchData = (await fileSearchRes.json()) as { files: { path: string; name: string }[] };
    __jait_capture(2, (fileSearchData.files));

    const contentSearchRes = await authedFetch(
      `${address}/api/project/search?query=${encodeURIComponent("project-search-regression")}&mode=content&surfaceId=${encodeURIComponent(surfaceId)}`,
      { headers: searchHeaders },
    );
    __jait_capture(3, (contentSearchRes.ok));
    const contentSearchData = (await contentSearchRes.json()) as { matches: { file: string; line: number; content: string }[] };
    __jait_capture(4, (contentSearchData.matches));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_404_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const writeRes = await authedFetch(`${address}/api/project/write`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "../outside.txt", content: "blocked", surfaceId }),
    });

    __jait_capture(0, (writeRes.status));
    const data = (await writeRes.json()) as { error: string };
    __jait_capture(1, (data.error));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_423_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    // Open first project
    const res1 = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId: first } = (await res1.json()) as { surfaceId: string };

    // Open a different project (same session)
    const secondProjectRoot = join(writableTestRoot, "second-project");
    await mkdir(secondProjectRoot, { recursive: true });
    const res2 = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: secondProjectRoot, sessionId }),
    });
    const { surfaceId: second } = (await res2.json()) as { surfaceId: string };

    // First surface should be gone
    __jait_captureType(0, (surfaceRegistry.getSurface(first)));
    // Second should be running
    const s = surfaceRegistry.getSurface(second);
    __jait_captureType(1, (s));
    __jait_capture(2, (s?.state));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_450_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId, openPanel: true }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    await surfaceRegistry.stopAll("shutdown");

    const state = sessionState.get(sessionId, ["project.panel"]);
    __jait_capture(0, (state["project.panel"]), ({
      open: true,
      remotePath: writableTestRoot,
      surfaceId,
      nodeId: "gateway",
    }));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_469_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const user = users.createUser(`project-open-${Date.now()}`, "password123");
    const project = projects.create({
      userId: user.id,
      title: "jait",
      rootPath: "/home/alice/jait",
      nodeId: "gateway",
    });
    const session = sessions.create({
      userId: user.id,
      projectId: project.id,
      projectPath: "/home/alice/jait",
      name: "Current chat",
    });

    const res = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: session.id }),
    });

    __jait_capture(0, (res.ok));

    const updatedSession = sessions.getById(session.id, user.id);
    __jait_capture(1, (updatedSession?.projectPath), (writableTestRoot));

    const updatedProject = projects.getById(project.id, user.id);
    __jait_capture(2, (updatedProject?.rootPath));
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_open_test_ts_499_3": {


/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let address: string;
let authToken: string;
let ownerId: string;
const authedFetch: typeof fetch = (input, init) => {
    const headers = new Headers(init?.headers);
    if (!headers.has("authorization")) headers.set("authorization", "Bearer " + authToken);
    return fetch(input, { ...init, headers });
  };
let sessionId = "test-session-" + Date.now();
let sessionState: SessionStateService;
let surfaceRegistry: SurfaceRegistry;
let sessions: SessionService;
let projects: ProjectService;
let projectState: ProjectStateService;
let users: UserService;
let ws: WsControlPlane;
let writableTestRoot: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let writableTestFile: string;
const __jait_hook_2091 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    sessions = new SessionService(db);
    sessionState = new SessionStateService(db);
    users = new UserService(db);
    const owner = users.createUser("project-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    projects = new ProjectService(db);
    projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const artifactRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts");
    await mkdir(artifactRoot, { recursive: true });
    writableTestRoot = await mkdtemp(join(artifactRoot, "jait-project-route-"));
    execFileSync("git", ["init", "--quiet"], { cwd: writableTestRoot });
    await mkdir(join(writableTestRoot, "data"), { recursive: true });

    ws = new WsControlPlane(config);

    // Persist project state on surface start (same as index.ts)
    surfaceRegistry.onSurfaceStarted = (id, surface) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        const projectRoot = (snap.metadata as Record<string, unknown>)?.projectRoot ?? null;
        if (sid) {
          sessionState.set(sid, { "project.panel": { open: true, remotePath: projectRoot, surfaceId: id } });
        }
      }
    };

    surfaceRegistry.onSurfaceStopped = (id, surface, context) => {
      if (surface.type === "filesystem") {
        const snap = surface.snapshot();
        const sid = snap.sessionId ?? "";
        if (sid && context?.reason !== "shutdown") {
          sessionState.set(sid, { "project.panel": null });
        }
      }
    };

    app = await createServer(config, {
      db,
      sqlite,
      sessionService: sessions,
      userService: users,
      projectService: projects,
      surfaceRegistry,
      sessionState,
      projectState,
      ws,
    });

    await app.listen({ port: 0, host: "127.0.0.1" });
    const addr = app.server.address();
    address = typeof addr === "string" ? addr : `http://127.0.0.1:${addr?.port}`;

    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    writableTestFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(writableTestFile, "before", "utf-8");
  };
const __jait_hook_4671 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2091();
try {
await (async()=>{

    const firstRoot = await mkdtemp(join(resolve(__jait_original_dir, "../../../../.jait/artifacts"), "jait-project-first-"));
    const secondRoot = await mkdtemp(join(resolve(__jait_original_dir, "../../../../.jait/artifacts"), "jait-project-second-"));
    const secondFile = join(secondRoot, "AGENTS.md");
    await writeFile(secondFile, "project instructions", "utf-8");

    try {
      const firstOpen = await authedFetch(`${address}/api/project/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: firstRoot, sessionId: `first-${Date.now()}` }),
      });
      const { surfaceId: staleSurfaceId } = (await firstOpen.json()) as { surfaceId: string };

      await authedFetch(`${address}/api/project/open`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path: secondRoot, sessionId: `second-${Date.now()}` }),
      });

      const readRes = await authedFetch(
        `${address}/api/project/read?path=${encodeURIComponent(secondFile)}&surfaceId=${encodeURIComponent(staleSurfaceId)}`,
      );

      __jait_capture(0, (readRes.ok));
      const data = (await readRes.json()) as { content: string };
      __jait_capture(1, (data.content));
    } finally {
      await rm(firstRoot, { recursive: true, force: true });
      await rm(secondRoot, { recursive: true, force: true });
    }
  
})();

} finally {
await __jait_hook_4671();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
