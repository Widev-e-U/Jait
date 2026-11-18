// Translated fixture from packages/gateway/src/tools/project-tools.test.ts; expected literals are in tail_static.rs.
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createProjectCreateTool, createProjectMoveTool, createProjectTransferTool } from "../../../../packages/gateway/src/tools/project-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/project-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_53_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const broadcastToUser = vi.fn();
    const ws = { broadcastToUser } as unknown as WsControlPlane;
    const tool = createProjectCreateTool({ projectService, repoService, ws });

    const result = await tool.execute(
      { title: "Agent Project", assignRepository: false },
      context(),
    );

    __jait_capture(0, (result.ok));
    const project = (result.data as { project: { id: string } }).project;
    __jait_capture(1, (broadcastToUser.mock.calls), ([project.id]));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_71_3_each0": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
const existing = false;
await __jait_hook_1312();
try {
await (async()=>{

    const sessionService = new SessionService(db);
    const previous = projectService.create({ userId: "user-1", rootPath: "/old" });
    const chat = sessionService.create({ userId: "user-1", projectId: previous.id, projectPath: "/old" });
    if (existing) projectService.create({ userId: "user-1", rootPath: "/new", nodeId: "gateway" });
    const broadcastToUser = vi.fn();
    const tool = createProjectCreateTool({ projectService, repoService, sessionService, ws: { broadcastToUser } as unknown as WsControlPlane });
    const result = await tool.execute({ projectRoot: "/new", assignRepository: false }, context({ sessionId: chat.id }));
    const project = (result.data as { project: { id: string } }).project;
    __jait_capture(0, (sessionService.getById(chat.id)?.projectId), (project.id));
    __jait_capture(1, (sessionService.getById(chat.id)?.projectPath));
    __jait_capture(2, (broadcastToUser.mock.calls.map((call) => call[1].type)));
    __jait_capture(3, (broadcastToUser.mock.calls), ([previous.id,project.id,chat.id]));
  
})();

} finally {
await __jait_hook_1564();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_71_3_each1": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
/*__jait_scope_open__*/{
const existing = true;
await __jait_hook_1312();
try {
await (async()=>{

    const sessionService = new SessionService(db);
    const previous = projectService.create({ userId: "user-1", rootPath: "/old" });
    const chat = sessionService.create({ userId: "user-1", projectId: previous.id, projectPath: "/old" });
    if (existing) projectService.create({ userId: "user-1", rootPath: "/new", nodeId: "gateway" });
    const broadcastToUser = vi.fn();
    const tool = createProjectCreateTool({ projectService, repoService, sessionService, ws: { broadcastToUser } as unknown as WsControlPlane });
    const result = await tool.execute({ projectRoot: "/new", assignRepository: false }, context({ sessionId: chat.id }));
    const project = (result.data as { project: { id: string } }).project;
    __jait_capture(0, (sessionService.getById(chat.id)?.projectId), (project.id));
    __jait_capture(1, (sessionService.getById(chat.id)?.projectPath));
    __jait_capture(2, (broadcastToUser.mock.calls.map((call) => call[1].type)));
    __jait_capture(3, (broadcastToUser.mock.calls), ([previous.id,project.id,chat.id]));
  
})();

} finally {
await __jait_hook_1564();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_88_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const sessionService = new SessionService(db);
    const chat = sessionService.create({ userId: "user-2", projectPath: "/old" });
    const tool = createProjectCreateTool({ projectService, repoService, sessionService });
    await tool.execute({ projectRoot: "/new", assignRepository: false }, context({ sessionId: chat.id }));
    __jait_captureType(0, (sessionService.getById(chat.id)?.projectId));
    __jait_capture(1, (sessionService.getById(chat.id)?.projectPath));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_97_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const tool = createProjectMoveTool({ projectService, repoService });
    const result = await tool.execute({}, context());
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_104_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: join(source, "does-not-exist") },
      context(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    const unchanged = projectService.getById(project.id, "user-1");
    __jait_capture(2, (unchanged?.rootPath), (source));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_120_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const destination = makeDir();
    const project = projectService.create({ userId: "user-1", title: "My Project", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: destination },
      context(),
    );

    __jait_capture(0, (result.ok));
    const moved = projectService.getById(project.id, "user-1");
    __jait_capture(1, (moved?.rootPath), (destination));
    __jait_capture(2, (moved?.nodeId));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_137_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "gateway", rootPath: source },
      context(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_151_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const tool = createProjectMoveTool({ projectService, repoService });

    const result = await tool.execute(
      { projectId: project.id, nodeId: "remote-node-1", rootPath: "/remote/path" },
      context(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    const unchanged = projectService.getById(project.id, "user-1");
    __jait_capture(2, (unchanged?.nodeId));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_167_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const tool = createProjectMoveTool({ projectService, repoService });
    const result = await tool.execute(
      { projectId: "missing-project", nodeId: "gateway", rootPath: "/anywhere" },
      context(),
    );
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_177_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const project = projectService.create({ userId: "user-1", title: "Move Me", rootPath: source, nodeId: "gateway" });
    const transfer = vi.fn(async () => ({ output: "copied" }));
    const proxyFsOp = vi.fn(async () => true);
    const broadcastToUser = vi.fn();
    const ws = {
      getFsNodes: () => [{ id: "node-2", name: "Studio", isGateway: false }],
      proxyFsOp,
      broadcastToUser,
    } as unknown as WsControlPlane;
    const tool = createProjectTransferTool({ projectService, repoService, transfer, ws });

    const result = await tool.execute({
      projectId: project.id,
      nodeId: "node-2",
      rootPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
    }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (transfer.mock.calls), ([{
      sourcePath: source,
      destinationPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
      sshPort: undefined,
    }]));
    __jait_capture(2, (proxyFsOp.mock.calls));
    __jait_capture(3, (projectService.getById(project.id, "user-1")));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_project_tools_test_ts_210_3": {


/*__jait_scope_open__*/{
let db: Awaited<ReturnType<typeof openDatabase>>["db"];
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projectService: ProjectService;
let repoService: RepositoryService;
const tempRoots: string[] = [];
function makeDir() {
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-project-move-"));
    tempRoots.push(root);
    return root;
  }
function context(overrides: Partial<ToolContext> = {}): ToolContext {
    return {
      sessionId: "session-1",
      actionId: "action-1",
      projectRoot: "/unused",
      requestedBy: "user",
      userId: "user-1",
      ...overrides,
    };
  }
const __jait_hook_1312 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projectService = new ProjectService(db);
    repoService = new RepositoryService(db);
  };
const __jait_hook_1564 = () => {
    sqlite.close();
    for (const root of tempRoots.splice(0)) {
      rmSync(root, { recursive: true, force: true });
    }
  };
await __jait_hook_1312();
try {
await (async()=>{

    const source = makeDir();
    const project = projectService.create({ userId: "user-1", rootPath: source, nodeId: "gateway" });
    const transfer = vi.fn(async () => { throw new Error("authentication failed"); });
    const ws = {
      getFsNodes: () => [{ id: "node-2", name: "Studio", isGateway: false }],
    } as unknown as WsControlPlane;
    const tool = createProjectTransferTool({ projectService, repoService, transfer, ws });

    const result = await tool.execute({
      projectId: project.id,
      nodeId: "node-2",
      rootPath: "/work/move-me",
      sshHost: "studio.local",
      sshUser: "jakob",
    }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (projectService.getById(project.id, "user-1")), ({ nodeId: "gateway", rootPath: source }));
  
})();

} finally {
await __jait_hook_1564();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
