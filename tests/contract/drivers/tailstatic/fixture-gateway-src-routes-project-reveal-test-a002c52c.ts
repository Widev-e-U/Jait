// Translated fixture from packages/gateway/src/routes/project-reveal.test.ts; expected literals are in tail_static.rs.
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
import { join } from "node:path";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/project-reveal.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_project_reveal_test_ts_107_3": {


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
let sessionId = "reveal-session-" + Date.now();
let surfaceRegistry: SurfaceRegistry;
let writableTestRoot: string;
let nestedFile: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
const __jait_hook_2100 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const owner = users.createUser("reveal-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

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

    writableTestRoot = await mkdtemp(join(__jait_fixture_dir, "jait-reveal-route-"));
    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    nestedFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(nestedFile, "before", "utf-8");
  };
const __jait_hook_4019 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2100();
try {
await (async()=>{

    const res = await authedFetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ surfaceId: "none" }),
    });
    __jait_capture(0, (res.status));
    const body = (await res.json()) as { error: string };
    __jait_capture(1, (body.error));
  
})();

} finally {
await __jait_hook_4019();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_reveal_test_ts_118_3": {


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
let sessionId = "reveal-session-" + Date.now();
let surfaceRegistry: SurfaceRegistry;
let writableTestRoot: string;
let nestedFile: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
const __jait_hook_2100 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const owner = users.createUser("reveal-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

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

    writableTestRoot = await mkdtemp(join(__jait_fixture_dir, "jait-reveal-route-"));
    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    nestedFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(nestedFile, "before", "utf-8");
  };
const __jait_hook_4019 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2100();
try {
await (async()=>{

    const res = await authedFetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "/tmp", surfaceId: "no-such-surface" }),
    });
    __jait_capture(0, (res.status));
    const body = (await res.json()) as { error: string };
    __jait_capture(1, (body.error));
  
})();

} finally {
await __jait_hook_4019();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_reveal_test_ts_129_3": {


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
let sessionId = "reveal-session-" + Date.now();
let surfaceRegistry: SurfaceRegistry;
let writableTestRoot: string;
let nestedFile: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
const __jait_hook_2100 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const owner = users.createUser("reveal-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

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

    writableTestRoot = await mkdtemp(join(__jait_fixture_dir, "jait-reveal-route-"));
    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    nestedFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(nestedFile, "before", "utf-8");
  };
const __jait_hook_4019 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2100();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    const res = await authedFetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: nestedFile, surfaceId }),
    });

    // On headless CI the platform "open" command may be missing, in which case
    // the route returns 500 REVEAL_FAILED. Either outcome proves the surface
    // was found and the reveal was attempted for the right path.
    if (res.ok) {
      const body = (await res.json()) as { ok: boolean };
      __jait_capture(0, (body.ok));
    } else {
      const body = (await res.json()) as { error: string };
      __jait_capture(1, (body.error));
    }
  
})();
__jait_record({slot:2,completed:true});
} finally {
await __jait_hook_4019();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_project_reveal_test_ts_155_3": {


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
let sessionId = "reveal-session-" + Date.now();
let surfaceRegistry: SurfaceRegistry;
let writableTestRoot: string;
let nestedFile: string;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
const __jait_hook_2100 = async () => {
    const config = loadConfig();
    const opened = await openDatabase(":memory:");
    const { db } = opened;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const sessions = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const users = new UserService(db);
    const owner = users.createUser("reveal-owner", "password123");
    ownerId = owner.id;
    authToken = await signAuthToken(owner, config.jwtSecret);
    sessionId = sessions.create({ userId: ownerId }).id;
    const projects = new ProjectService(db);
    const projectState = new ProjectStateService(db);
    surfaceRegistry = new SurfaceRegistry();
    surfaceRegistry.register(new FileSystemSurfaceFactory());

    const ws = new WsControlPlane(config);

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

    writableTestRoot = await mkdtemp(join(__jait_fixture_dir, "jait-reveal-route-"));
    await mkdir(join(writableTestRoot, "nested"), { recursive: true });
    nestedFile = join(writableTestRoot, "nested", "editable.txt");
    await writeFile(nestedFile, "before", "utf-8");
  };
const __jait_hook_4019 = async () => {
    await surfaceRegistry.stopAll("test-cleanup");
    await app?.close();
    sqlite?.close();
    if (writableTestRoot) await rm(writableTestRoot, { recursive: true, force: true });
  };
await __jait_hook_2100();
try {
await (async()=>{

    const openRes = await authedFetch(`${address}/api/project/open`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: writableTestRoot, sessionId: `rel-${sessionId}` }),
    });
    const { surfaceId } = (await openRes.json()) as { surfaceId: string };

    // Pass a relative path (no leading project root) — the route should still
    // resolve it under the project root and attempt the reveal.
    const res = await authedFetch(`${address}/api/project/reveal`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: "nested/editable.txt", surfaceId }),
    });

    __jait_capture(0, ([200, 500]), (res.status));
    if (res.ok) {
      const body = (await res.json()) as { ok: boolean };
      __jait_capture(1, (body.ok));
    } else {
      const body = (await res.json()) as { error: string };
      __jait_capture(2, (body.error));
    }
  
})();

} finally {
await __jait_hook_4019();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
