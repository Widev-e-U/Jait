// Translated fixture from packages/gateway/src/routes/projects.test.ts; expected literals are in tail_static.rs.
import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { ProjectStateService } from "../../../../packages/gateway/src/services/project-state.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { GitService } from "../../../../packages/gateway/src/services/git.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { resolveProjectRootPathStatus } from "../../../../packages/gateway/src/routes/projects.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/projects.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_projects_test_ts_32_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyFsOp = vi.fn(async () => false);
    const ws = {
      getFsNodes: () => [{ id: "windows-node", isGateway: false }],
      proxyFsOp,
    } as unknown as Parameters<typeof resolveProjectRootPathStatus>[2];

    await __jait_captureResolved(0, (resolveProjectRootPathStatus("E:\\moved-project", "windows-node", ws)));
    __jait_capture(1, (proxyFsOp.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_89_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("project-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const createSessionRes = await app.inject({
      method: "POST",
      url: "/api/sessions",
      headers,
      payload: { name: "Chat one" }
    });
    __jait_capture(0, (createSessionRes.statusCode));
    const createdSession = JSON.parse(createSessionRes.body) as { projectId: string | null };
    __jait_captureType(1, (createdSession.projectId));

    const createProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Jait Repo", rootPath: "/project/Jait" }
    });
    __jait_capture(2, (createProjectRes.statusCode));
    const project = JSON.parse(createProjectRes.body) as { id: string; rootPath: string | null; title: string };
    __jait_capture(3, (project.rootPath));

    const createProjectSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Fix tests" }
    });
    __jait_capture(4, (createProjectSessionRes.statusCode));

    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects?status=active",
      headers
    });
    __jait_capture(5, (listRes.statusCode));
    const body = JSON.parse(listRes.body) as {
      projects: Array<{ id: string; sessions: Array<{ name: string; projectId: string | null }> }>;
    };
    __jait_capture(6, (body.projects.length));
    const repoProject = body.projects.find((entry) => entry.id === project.id);
    __jait_capture(7, (repoProject?.sessions.map((session) => session.name)));
    __jait_capture(8, (repoProject?.sessions[0]?.projectId), (project.id));

    const sessionsRes = await app.inject({
      method: "GET",
      url: "/api/sessions?status=active",
      headers
    });
    __jait_capture(9, (sessionsRes.statusCode));
    const sessionsBody = JSON.parse(sessionsRes.body) as {
      sessions: Array<{ name: string; projectId: string | null }>;
    };
    __jait_capture(10, (sessionsBody.sessions.some((session) => session.name === "Chat one" && session.projectId === null)));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_147_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("missing-root-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const existingRoot = mkdtempSync(join(__jait_fixture_dir, "jait-existing-project-"));
    tempRoots.push(existingRoot);
    const missingRoot = join(existingRoot, "moved-away");

    await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Still here", rootPath: existingRoot }
    });
    await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Moved", rootPath: missingRoot }
    });

    const listRes = await app.inject({
      method: "GET",
      url: "/api/projects?status=active",
      headers
    });
    __jait_capture(0, (listRes.statusCode));
    const projects = (JSON.parse(listRes.body) as {
      projects: Array<{ title: string; rootPathStatus: string }>;
    }).projects;
    __jait_capture(1, (projects.find((project) => project.title === "Still here")?.rootPathStatus));
    __jait_capture(2, (projects.find((project) => project.title === "Moved")?.rootPathStatus));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_180_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("title-user", "password123");
    userService.updateSettings(user.id, { apiKeys: { OPENAI_API_KEY: "test-key" } });
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    // mockImplementation (not mockResolvedValue): every call gets a fresh
    // Response body. A shared Response is consumed by the first res.json() and
    // poisons later reads — and background polling (e.g. messenger sync) can
    // legitimately call fetch while this test runs.
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content: "Diagnose Desktop gray screens" } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const createRes = await app.inject({
        method: "POST",
        url: "/api/sessions",
        headers,
        payload: {}
      });
      const session = JSON.parse(createRes.body) as { id: string; name: string };
      __jait_capture(0, (session.name));

      const titleRes = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/generate-title`,
        headers,
        payload: { prompt: "my windows node shows a gray window randomly" }
      });
      __jait_capture(1, (titleRes.statusCode));
      const titleBody = JSON.parse(titleRes.body) as { session: { name: string }; generated: boolean };
      __jait_capture(2, (titleBody.generated));
      __jait_capture(3, (titleBody.session.name));
      // Scope to the completion call: unrelated background services may fetch
      // while the test runs (messenger sync), so a global call count is racy.
      const completionCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).includes("/chat/completions"));
      __jait_capture(4, (completionCalls.length));
    } finally {
      fetchSpy.mockRestore();
    }
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_221_3_each0": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
const content = "<tool_call>";
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("protocol-title-user", "password123");
    userService.updateSettings(user.id, { apiKeys: { OPENAI_API_KEY: "test-key" } });
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const createRes = await app.inject({ method: "POST", url: "/api/sessions", headers, payload: {} });
      const session = createRes.json() as { id: string };
      const prompt = "Help investigate intermittent desktop crashes";
      const titleRes = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/generate-title`,
        headers,
        payload: { prompt }
      });
      __jait_capture(0, (titleRes.statusCode));
      __jait_capture(1, (titleRes.json()), ({ generated: false, session: { name: prompt } }));

      const savedRes = await app.inject({ method: "GET", url: `/api/sessions/${session.id}`, headers });
      __jait_capture(2, (savedRes.statusCode));
      __jait_capture(3, (savedRes.json()), ({ name: prompt }));
    } finally {
      fetchSpy.mockRestore();
    }
  
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_221_3_each1": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
const content = '<tool_call>\n{"name":"terminal","arguments":{}}\n</tool_call>';
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("protocol-title-user", "password123");
    userService.updateSettings(user.id, { apiKeys: { OPENAI_API_KEY: "test-key" } });
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockImplementation(async () => new Response(JSON.stringify({
      choices: [{ message: { content } }]
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    try {
      const createRes = await app.inject({ method: "POST", url: "/api/sessions", headers, payload: {} });
      const session = createRes.json() as { id: string };
      const prompt = "Help investigate intermittent desktop crashes";
      const titleRes = await app.inject({
        method: "POST",
        url: `/api/sessions/${session.id}/generate-title`,
        headers,
        payload: { prompt }
      });
      __jait_capture(0, (titleRes.statusCode));
      __jait_capture(1, (titleRes.json()), ({ generated: false, session: { name: prompt } }));

      const savedRes = await app.inject({ method: "GET", url: `/api/sessions/${session.id}`, headers });
      __jait_capture(2, (savedRes.statusCode));
      __jait_capture(3, (savedRes.json()), ({ name: prompt }));
    } finally {
      fetchSpy.mockRestore();
    }
  
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_253_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("state-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const projectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "My Repo", rootPath: "/project/repo" }
    });
    const project = JSON.parse(projectRes.body) as { id: string };

    const firstSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "First chat" }
    });
    const firstSession = JSON.parse(firstSessionRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${project.id}/state`,
      headers,
      payload: {
        "project.layout": { tree: false, editor: true },
        "project.tabs": { activeTabId: "file:src/index.ts", tabs: [] }
      }
    });

    const secondSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/sessions`,
      headers,
      payload: { name: "Second chat" }
    });
    __jait_capture(0, (secondSessionRes.statusCode));

    const stateRes = await app.inject({
      method: "GET",
      url: `/api/projects/${project.id}/state?keys=project.layout,project.tabs`,
      headers
    });
    __jait_capture(1, (stateRes.statusCode));
    __jait_capture(2, (JSON.parse(stateRes.body)));

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    __jait_capture(3, (lastActiveRes.statusCode));
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string; projectId: string | null } | null;
    };
    __jait_capture(4, (lastActive.project?.id), (project.id));
    __jait_capture(5, (lastActive.session?.projectId), (project.id));
    __jait_capture(6, (lastActive.session?.id), (firstSession.id));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_317_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("editor-status-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const activeProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Editor Active", rootPath: "/project/editor-active" }
    });
    const inactiveProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Editor Inactive", rootPath: "/project/editor-inactive" }
    });
    const activeProject = JSON.parse(activeProjectRes.body) as { id: string };
    const inactiveProject = JSON.parse(inactiveProjectRes.body) as { id: string };

    await app.inject({
      method: "PATCH",
      url: `/api/projects/${activeProject.id}/state`,
      headers,
      payload: {
        "project.ui": {
          panel: { open: true, remotePath: "/project/editor-active" },
          tabs: null,
          layout: null,
          terminal: null,
          preview: null
        }
      }
    });
    await app.inject({
      method: "PATCH",
      url: `/api/projects/${inactiveProject.id}/state`,
      headers,
      payload: {
        "project.ui": {
          panel: { open: false, remotePath: "/project/editor-inactive" },
          tabs: null,
          layout: null,
          terminal: null,
          preview: null
        }
      }
    });

    const listRes = await app.inject({ method: "GET", url: "/api/projects", headers });
    __jait_capture(0, (listRes.statusCode));
    const listed = JSON.parse(listRes.body) as {
      projects: Array<{ id: string; editorModeActive?: boolean }>;
    };
    __jait_capture(1, (listed.projects.find((project) => project.id === activeProject.id)?.editorModeActive));
    __jait_capture(2, (listed.projects.find((project) => project.id === inactiveProject.id)?.editorModeActive));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_374_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("select-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const selectedProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Selected Project", rootPath: "/project/selected" }
    });
    const selectedProject = JSON.parse(selectedProjectRes.body) as { id: string };
    const selectedSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${selectedProject.id}/sessions`,
      headers,
      payload: { name: "Selected chat" }
    });
    const selectedSession = JSON.parse(selectedSessionRes.body) as { id: string };

    // User explicitly picks this project/session in the UI.
    const selectRes = await app.inject({
      method: "POST",
      url: "/api/projects/select",
      headers,
      payload: { projectId: selectedProject.id, sessionId: selectedSession.id }
    });
    __jait_capture(0, (selectRes.statusCode));

    // Unrelated activity happens afterwards on a different project (e.g. a
    // background automation turn) — this must not steal "last-active".
    const otherProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Other Project", rootPath: "/project/other" }
    });
    const otherProject = JSON.parse(otherProjectRes.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/projects/${otherProject.id}/sessions`,
      headers,
      payload: { name: "Background automation chat" }
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    __jait_capture(1, (lastActiveRes.statusCode));
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string } | null;
    };
    __jait_capture(2, (lastActive.project?.id), (selectedProject.id));
    __jait_capture(3, (lastActive.session?.id), (selectedSession.id));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_432_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("select-user-no-session", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const selectedProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Selected Project", rootPath: "/project/selected" }
    });
    const selectedProject = JSON.parse(selectedProjectRes.body) as { id: string };

    // User explicitly picks this project in the UI before it has any
    // sessions, so the client persists sessionId: null (see
    // getLatestProjectSessionId in apps/web/src/lib/project-sessions.ts).
    const selectRes = await app.inject({
      method: "POST",
      url: "/api/projects/select",
      headers,
      payload: { projectId: selectedProject.id, sessionId: null }
    });
    __jait_capture(0, (selectRes.statusCode));

    // Unrelated activity happens afterwards on a different project (e.g. a
    // background automation turn) — this must not steal "last-active".
    const otherProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Other Project", rootPath: "/project/other" }
    });
    const otherProject = JSON.parse(otherProjectRes.body) as { id: string };
    await app.inject({
      method: "POST",
      url: `/api/projects/${otherProject.id}/sessions`,
      headers,
      payload: { name: "Background automation chat" }
    });

    const lastActiveRes = await app.inject({
      method: "GET",
      url: "/api/projects/last-active",
      headers
    });
    __jait_capture(1, (lastActiveRes.statusCode));
    const lastActive = JSON.parse(lastActiveRes.body) as {
      project: { id: string } | null;
      session: { id: string } | null;
    };
    __jait_capture(2, (lastActive.project?.id), (selectedProject.id));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_484_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("delete-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const emptyProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Scratch" }
    });
    const emptyProject = JSON.parse(emptyProjectRes.body) as { id: string };

    const deleteEmptyRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${emptyProject.id}`,
      headers
    });
    __jait_capture(0, (deleteEmptyRes.statusCode));

    const seededProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Keep me" }
    });
    const seededProject = JSON.parse(seededProjectRes.body) as { id: string };

    const createSessionRes = await app.inject({
      method: "POST",
      url: `/api/projects/${seededProject.id}/sessions`,
      headers,
      payload: { name: "Existing chat" }
    });
    __jait_capture(1, (createSessionRes.statusCode));
    const session = JSON.parse(createSessionRes.body) as { id: string };

    const deleteSeededRes = await app.inject({
      method: "DELETE",
      url: `/api/projects/${seededProject.id}`,
      headers
    });
    __jait_capture(2, (deleteSeededRes.statusCode));

    // The project should now be archived (not destroyed) and restorable.
    const archivedRes = await app.inject({
      method: "GET",
      url: "/api/projects/archived",
      headers
    });
    __jait_capture(3, (archivedRes.statusCode));
    const archived = JSON.parse(archivedRes.body) as { projects: Array<{ id: string }> };
    __jait_capture(4, (archived.projects.map((p) => p.id)), (seededProject.id));

    // Its session should have been archived alongside it.
    const sessionsRes = await app.inject({
      method: "GET",
      url: `/api/projects/${seededProject.id}/sessions?status=archived`,
      headers
    });
    __jait_capture(5, (sessionsRes.statusCode));
    const sessions = JSON.parse(sessionsRes.body) as { sessions: Array<{ id: string }> };
    __jait_capture(6, (sessions.sessions.map((s) => s.id)), (session.id));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_548_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_2177();
try {
await (async()=>{

    const user = userService.createUser("repo-project-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);
    const rootPath = makeGitProjectRoot();

    const createProjectRes = await app.inject({
      method: "POST",
      url: "/api/projects",
      headers,
      payload: { title: "Route Repo", rootPath }
    });
    __jait_capture(0, (createProjectRes.statusCode));
    const project = JSON.parse(createProjectRes.body) as { id: string; metadata: string | null };
    const metadata = JSON.parse(project.metadata ?? "{}") as { repositoryId?: string };
    __jait_captureType(1, (metadata.repositoryId));

    const reposRes = await app.inject({
      method: "GET",
      url: "/api/repos",
      headers
    });
    __jait_capture(2, (reposRes.statusCode));
    const reposBody = JSON.parse(reposRes.body) as { repos: Array<{ id: string; localPath: string }> };
    __jait_capture(3, (reposBody.repos), ([metadata.repositoryId,rootPath]));

    const assignRes = await app.inject({
      method: "POST",
      url: `/api/projects/${project.id}/repository`,
      headers,
      payload: {}
    });
    __jait_capture(4, (assignRes.statusCode));
    const assignBody = JSON.parse(assignRes.body) as { skipped: boolean; repo: { id: string } };
    __jait_capture(5, (assignBody.skipped));
    __jait_capture(6, (assignBody.repo.id), (metadata.repositoryId));
  
})();

} finally {
await __jait_hook_2898();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_600_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-user");
      const folder = await createFolder(headers, { title: "Work", description: "Job stuff", color: "blue" });
      __jait_capture(1, (folder.kind));
      __jait_captureType(2, (folder.rootPath));
      __jait_capture(3, (folder.color));
      __jait_capture(4, (folder.description));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_609_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-distinct-user");
      const a = await createFolder(headers, { title: "A" });
      const b = await createFolder(headers, { title: "B" });
      __jait_capture(1, (a.id), (b.id));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_616_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-conflict-user");
      const first = await createFolder(headers, { title: "Jait", rootPath: "/srv/jait" });

      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { title: "Jait again", rootPath: "/srv/jait", exclusiveRoot: true },
      });

      // Previously this answered 201 with the *existing* project, so the dialog
      // closed, nothing new appeared, and the click looked like it did nothing.
      __jait_capture(1, (res.statusCode));
      const body = JSON.parse(res.body) as { error: string; details: string };
      __jait_capture(2, (body.error));
      __jait_capture(3, (body.details));

      const listRes = await app.inject({ method: "GET", url: "/api/projects", headers });
      const list = JSON.parse(listRes.body) as { projects: { id: string }[] };
      __jait_capture(4, (list.projects.map((p) => p.id)), ([first.id]));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_639_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-adopt-user");
      const first = await createFolder(headers, { title: "Jait", rootPath: "/srv/adopt" });

      // The editor's open-folder flow sends no exclusiveRoot: reusing the
      // project you already have is exactly what it wants.
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { rootPath: "/srv/adopt" },
      });

      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { id: string }).id), (first.id));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_656_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-patch-conflict-user");
      await createFolder(headers, { title: "Jait", rootPath: "/srv/patch-taken" });
      const folder = await createFolder(headers, { title: "Ideas" });

      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { rootPath: "/srv/patch-taken" },
      });

      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { error: string }).error));
      // The folder must be untouched, not half-updated.
      const after = await app.inject({ method: "GET", url: "/api/projects", headers });
      const rows = (JSON.parse(after.body) as { projects: { id: string; rootPath: string | null; kind: string }[] }).projects;
      const unchanged = rows.find((p) => p.id === folder.id);
      __jait_captureType(3, (unchanged?.rootPath));
      __jait_capture(4, (unchanged?.kind));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_678_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-patch-self-user");
      const project = await createFolder(headers, { title: "Jait", rootPath: "/srv/self" });

      // Re-sending the row's own path must not read as a conflict with itself.
      const res = await app.inject({
        method: "PATCH",
        url: `/api/projects/${project.id}`,
        headers,
        payload: { rootPath: "/srv/self", title: "Renamed" },
      });

      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { title: string }).title));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_694_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-move-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${child.id}/move`,
        headers,
        payload: { parentId: parent.id }
      });
      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { parentId: string }).parentId), (parent.id));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_709_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-cycle-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/move`, headers, payload: { parentId: parent.id } });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${parent.id}/move`,
        headers,
        payload: { parentId: child.id }
      });
      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { error: string }).error));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_725_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-bad-parent-user");
      const res = await app.inject({
        method: "POST",
        url: "/api/projects",
        headers,
        payload: { title: "Orphan", parentId: "does-not-exist" }
      });
      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { error: string }).error));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_737_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-patch-user");
      const folder = await createFolder(headers, { title: "Ctx" });

      const set = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { instructions: "answer in german", description: "d", color: "#00FF00" }
      });
      __jait_capture(1, (set.statusCode));
      const afterSet = JSON.parse(set.body) as { instructions: string; description: string; color: string };
      __jait_capture(2, (afterSet.instructions));
      __jait_capture(3, (afterSet.color));

      const clear = await app.inject({
        method: "PATCH",
        url: `/api/projects/${folder.id}`,
        headers,
        payload: { instructions: null, color: null }
      });
      const afterClear = JSON.parse(clear.body) as { instructions: string | null; color: string | null; description: string };
      __jait_captureType(4, (afterClear.instructions));
      __jait_captureType(5, (afterClear.color));
      // Not included in the patch, so it must survive untouched.
      __jait_capture(6, (afterClear.description));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_765_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const headers = await folderUser("folder-subtree-user");
      const parent = await createFolder(headers, { title: "Parent" });
      const child = await createFolder(headers, { title: "Child" });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/move`, headers, payload: { parentId: parent.id } });
      await app.inject({ method: "POST", url: `/api/projects/${child.id}/sessions`, headers, payload: { name: "chat" } });

      const res = await app.inject({ method: "GET", url: `/api/projects/${parent.id}/subtree`, headers });
      __jait_capture(1, (res.statusCode));
      const body = JSON.parse(res.body) as { descendantCount: number; sessionCount: number };
      __jait_capture(2, (body.descendantCount));
      __jait_capture(3, (body.sessionCount));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_projects_test_ts_779_5": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test"
};
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
const tempRoots: string[] = [];
function makeGitProjectRoot() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-route-"));
    tempRoots.push(root);
    mkdirSync(join(root, ".git"));
    return root;
  }
const __jait_hook_2177 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    const sessionService = new SessionService(opened.db);
    const projectService = new ProjectService(opened.db);
    const projectState = new ProjectStateService(opened.db);
    const repoService = new RepositoryService(opened.db);
    userService = new UserService(opened.db);
    const audit = new AuditWriter(opened.db);

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      sessionService,
      projectService,
      projectState,
      repoService,
      gitService: new GitService(),
      userService,
      audit
    });
  };
const __jait_hook_2898 = async () => {
    await app.close();
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
async function folderUser(name: string) {
      const user = userService.createUser(name, "password123");
      return authHeaders(user.id, user.username, testConfig.jwtSecret);
    }
const createFolder = async (headers: Record<string, string>, payload: Record<string, unknown>) => {
      const res = await app.inject({ method: "POST", url: "/api/projects", headers, payload: { ...payload } });
      __jait_capture(0, (res.statusCode));
      return JSON.parse(res.body) as { id: string; kind: string; rootPath: string | null; color: string | null; description: string | null };
    };
await __jait_hook_2177();
try {
await (async()=>{

      const mine = await folderUser("folder-owner-a");
      const theirs = await folderUser("folder-owner-b");
      const foreign = await createFolder(theirs, { title: "Theirs" });
      const own = await createFolder(mine, { title: "Mine" });

      const res = await app.inject({
        method: "POST",
        url: `/api/projects/${own.id}/move`,
        headers: mine,
        payload: { parentId: foreign.id }
      });
      __jait_capture(1, (res.statusCode));
      __jait_capture(2, ((JSON.parse(res.body) as { error: string }).error));
    
})();

} finally {
await __jait_hook_2898();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
