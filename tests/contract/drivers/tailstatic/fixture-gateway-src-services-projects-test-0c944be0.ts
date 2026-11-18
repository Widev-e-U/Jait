// Translated fixture from packages/gateway/src/services/projects.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { getProjectRepositoryId, ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/projects.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_projects_test_ts_28_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
await __jait_hook_513();
try {
await (async()=>{

    const remote = projects.create({
      userId,
      rootPath: "E:\\TizenAnilabStream",
      nodeId: "desktop-windows"
    });

    const resolved = projects.getOrCreateForRoot({
      userId,
      rootPath: "e:/tizenanilabstream/",
      nodeId: "gateway"
    });

    __jait_capture(0, (resolved.id), (remote.id));
    __jait_capture(1, (projects.list("active", userId)));
    __jait_capture(2, (resolved.nodeId));
  
})();

} finally {
await __jait_hook_853();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_46_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
await __jait_hook_513();
try {
await (async()=>{

    const first = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-a" });
    const second = projects.getOrCreateForRoot({ userId, rootPath: "/workspace/app", nodeId: "node-b" });

    __jait_capture(0, (second.id), (first.id));
    __jait_capture(1, (projects.list("active", userId)));
  
})();

} finally {
await __jait_hook_853();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_54_3": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
await __jait_hook_513();
try {
await (async()=>{

    const matchingProject = projects.create({ userId, title: "Desktop reliability", rootPath: "/workspace/desktop" });
    const otherProject = projects.create({ userId, title: "Gateway", rootPath: "/workspace/gateway" });
    sessions.create({ userId, projectId: matchingProject.id, name: "Investigate gray window" });
    sessions.create({ userId, projectId: otherProject.id, name: "Improve global chat search" });
    sessions.create({ userId, name: "Personal gray-screen notes" });

    const otherUserId = users.createUser("other-owner", "password123").id;
    const privateProject = projects.create({ userId: otherUserId, title: "Gray private project" });
    sessions.create({ userId: otherUserId, projectId: privateProject.id, name: "Gray private chat" });

    const grayResults = projects.searchWithSessions(userId, "gray");
    __jait_capture(0, (grayResults.projects.map((project) => project.id)), ([matchingProject.id]));
    __jait_capture(1, (grayResults.projects[0]?.sessions.map((session) => session.name)));
    __jait_capture(2, (grayResults.personalSessions.map((session) => session.name)));

    const olderChatResults = projects.searchWithSessions(userId, "global chat search");
    __jait_capture(3, (olderChatResults.projects.map((project) => project.id)), ([otherProject.id]));
    __jait_capture(4, (olderChatResults.projects[0]?.sessions.map((session) => session.name)));
  
})();

} finally {
await __jait_hook_853();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_76_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const folder = projects.create({ userId, title: "Work" });
      __jait_capture(0, (folder.kind));
      __jait_captureType(1, (folder.rootPath));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_82_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const folder = projects.create({ userId, title: "Work" });

      projects.update(folder.id, { rootPath: "/tmp/app" }, userId);
      __jait_capture(0, (projects.getById(folder.id, userId)?.kind));

      // Kind is derived, never chosen, so clearing the directory has to restore
      // the folder rather than leave a project claiming a path it lost.
      projects.update(folder.id, { rootPath: null }, userId);
      const cleared = projects.getById(folder.id, userId);
      __jait_capture(1, (cleared?.kind));
      __jait_captureType(2, (cleared?.rootPath));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_96_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const project = projects.create({ userId, rootPath: "/tmp/app" });
      __jait_capture(0, (project.kind));
      __jait_captureType(1, (project.parentId));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_102_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const project = projects.create({ userId, rootPath: "/tmp/app" });
      projects.assignRepository(project.id, "repo-1", userId);
      __jait_capture(0, (getProjectRepositoryId(projects.getById(project.id, userId))));

      projects.update(project.id, { rootPath: null }, userId);
      projects.clearRepository(project.id, userId);

      __jait_captureType(1, (getProjectRepositoryId(projects.getById(project.id, userId))));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_113_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const mono = projects.create({ userId, title: "Monorepo", rootPath: "/srv/mono" });
      const group = projects.create({ userId, title: "Experiments", parentId: mono.id });
      const leaf = projects.create({ userId, title: "Spike", parentId: group.id });

      // Without this a chat under a pathless folder would run in the gateway's
      // own cwd instead of the project it visibly sits in.
      __jait_capture(0, (projects.effectiveRootPath(leaf.id, userId)));
      __jait_capture(1, (projects.effectiveRootPath(mono.id, userId)));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_124_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const folder = projects.create({ userId, title: "Ideas" });
      const child = projects.create({ userId, title: "Later", parentId: folder.id });
      __jait_captureType(0, (projects.effectiveRootPath(child.id, userId)));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_130_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const folder = projects.create({
        userId,
        title: "Ops",
        description: "  Infra chats  ",
        color: "#AABBCC"
      });
      __jait_capture(0, (folder.description));
      __jait_capture(1, (folder.color));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_141_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const folder = projects.create({ userId, color: "url(evil)" });
      __jait_captureType(0, (folder.color));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_146_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const parent = projects.create({ userId, title: "Parent" });
      const child = projects.create({ userId, rootPath: "/tmp/child" });
      const moved = projects.move(child.id, parent.id, userId);
      __jait_capture(0, (moved?.parentId), (parent.id));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_153_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const a = projects.create({ userId, title: "A" });
      const b = projects.create({ userId, title: "B", parentId: a.id });
      __jait_thrown(0, () => projects.move(a.id, b.id, userId));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_159_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const ws = projects.create({ userId, rootPath: "/tmp/ws" });
      const folder = projects.create({ userId, title: "F" });
      // The child inherits /tmp/ws unless it gets a directory of its own, so
      // there is nothing ambiguous about hanging it here.
      __jait_capture(0, (projects.move(folder.id, ws.id, userId)?.parentId), (ws.id));
      __jait_capture(1, (projects.effectiveRootPath(folder.id, userId)));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_168_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const root = projects.create({ userId, title: "Root", instructions: "always german" });
      const leaf = projects.create({ userId, title: "Leaf", parentId: root.id, instructions: "be brief" });
      const chain = projects.resolveInstructionChain(leaf.id, userId)!;
      __jait_capture(0, (chain));
      __jait_capture(1, (chain));
      __jait_capture(2, (chain.indexOf("always german")), (chain.indexOf("be brief")));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_177_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      // The point of "Work" / "Private" folders: a real project with a path on
      // disk is categorised under one and picks up its context.
      const folder = projects.create({ userId, title: "Private", instructions: "casual tone" });
      const ws = projects.create({ userId, rootPath: "/tmp/side-project", title: "Side project" });
      projects.move(ws.id, folder.id, userId);

      const chain = projects.resolveInstructionChain(ws.id, userId)!;
      __jait_capture(0, (chain));
      // Categorising must not disturb the workspace's own identity.
      __jait_capture(1, (projects.getById(ws.id, userId)?.rootPath));
      __jait_capture(2, (projects.getById(ws.id, userId)?.kind));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_191_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const outer = projects.create({ userId, title: "Private", instructions: "casual tone" });
      const inner = projects.create({ userId, title: "OSS", parentId: outer.id, instructions: "answer in english" });
      const ws = projects.create({ userId, rootPath: "/tmp/oss", title: "Lib" });
      projects.move(ws.id, inner.id, userId);

      const chain = projects.resolveInstructionChain(ws.id, userId)!;
      __jait_capture(0, (chain.indexOf("casual tone")), (chain.indexOf("answer in english")));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_201_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const root = projects.create({ userId, title: "Root" });
      const leaf = projects.create({ userId, title: "Leaf", parentId: root.id });
      __jait_captureType(0, (projects.resolveInstructionChain(leaf.id, userId)));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_207_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const root = projects.create({ userId, title: "Root" });
      const mid = projects.create({ userId, title: "Mid", parentId: root.id });
      const leaf = projects.create({ userId, rootPath: "/tmp/leaf" });
      projects.move(leaf.id, mid.id, userId);

      projects.archive(root.id, userId);

      __jait_capture(0, (projects.getById(mid.id, userId)?.status));
      __jait_capture(1, (projects.getById(leaf.id, userId)?.status));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_219_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const root = projects.create({ userId, title: "Root" });
      const child = projects.create({ userId, title: "Child", parentId: root.id });
      sessions.create({ userId, projectId: root.id, name: "one" });
      sessions.create({ userId, projectId: child.id, name: "two" });
      __jait_capture(0, (projects.countSessionsInSubtree(root.id, userId)));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_projects_test_ts_227_5": {


/*__jait_scope_open__*/{
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let projects: ProjectService;
let sessions: SessionService;
let users: UserService;
let userId: string;
const __jait_hook_513 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    projects = new ProjectService(opened.db);
    sessions = new SessionService(opened.db);
    users = new UserService(opened.db);
    userId = users.createUser("project-owner", "password123").id;
  };
const __jait_hook_853 = () => {
    sqlite.close();
  };
/*__jait_scope_open__*/{
await __jait_hook_513();
try {
await (async()=>{

      const root = projects.create({ userId, title: "Root" });
      const child = projects.create({ userId, title: "Child", parentId: root.id });
      // Make the child the most recent so a limit of 1 would otherwise cut the
      // parent away and strand the child at the tree root.
      projects.touch(child.id);
      const { projects: page } = projects.listWithSessions(userId, "active", 1);
      __jait_capture(0, (page.map((p) => p.id).sort()), ([root.id, child.id].sort()));
    
})();

} finally {
await __jait_hook_853();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
