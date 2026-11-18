// Translated fixture from packages/gateway/src/routes/pull-requests.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { registerPullRequestRoutes, type PullRequestOperations } from "../../../../packages/gateway/src/routes/pull-requests.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/pull-requests.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_pull_requests_test_ts_54_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function mockOperations(): PullRequestOperations {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({
      number: 42,
      title: "Test PR",
      state: "OPEN",
      url: "https://github.com/acme/repo/pull/42",
      author: { login: "octocat", name: null },
      baseBranch: "main",
      headBranch: "feature",
      isDraft: false,
      reviewDecision: "",
      mergeStateStatus: "CLEAN",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      labels: [],
      checks: [],
      body: "",
      mergeable: "MERGEABLE",
      maintainerCanModify: true,
      comments: [],
      reviews: [],
      commits: [],
      files: [],
    })),
    diff: vi.fn(async () => ({ patch: "diff --git a/a b/a", truncated: false })),
    comment: vi.fn(async () => undefined),
    review: vi.fn(async () => undefined),
    merge: vi.fn(async () => undefined),
    resolveConflicts: vi.fn(async () => ({ status: "merged" })),
    setState: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const userOneOperations = mockOperations();
    const userTwoOperations = mockOperations();
    const pullRequestServiceForUser = vi.fn((userId: string) => (
      userId === "user-1" ? userOneOperations : userTwoOperations
    ));
    registerPullRequestRoutes(app, config, { repoService, pullRequestServiceForUser });

    const userOneRepo = repoService.create({
      userId: "user-1",
      name: "repo-one",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo-one",
    });
    const userTwoRepo = repoService.create({
      userId: "user-2",
      name: "repo-two",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo-two",
    });

    const userOneResponse = await app.inject({
      method: "GET",
      url: `/api/repos/${userOneRepo.id}/pull-requests`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });
    const userTwoResponse = await app.inject({
      method: "GET",
      url: `/api/repos/${userTwoRepo.id}/pull-requests`,
      headers: await authHeader(config.jwtSecret, "user-2"),
    });

    __jait_capture(0, ([userOneResponse.statusCode, userTwoResponse.statusCode]));
    __jait_capture(1, (pullRequestServiceForUser.mock.calls));
    __jait_capture(2, (pullRequestServiceForUser.mock.calls));
    __jait_capture(3, (userOneOperations.list.mock.calls));
    __jait_capture(4, (userTwoOperations.list.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_pull_requests_test_ts_109_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function mockOperations(): PullRequestOperations {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({
      number: 42,
      title: "Test PR",
      state: "OPEN",
      url: "https://github.com/acme/repo/pull/42",
      author: { login: "octocat", name: null },
      baseBranch: "main",
      headBranch: "feature",
      isDraft: false,
      reviewDecision: "",
      mergeStateStatus: "CLEAN",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      labels: [],
      checks: [],
      body: "",
      mergeable: "MERGEABLE",
      maintainerCanModify: true,
      comments: [],
      reviews: [],
      commits: [],
      files: [],
    })),
    diff: vi.fn(async () => ({ patch: "diff --git a/a b/a", truncated: false })),
    comment: vi.fn(async () => undefined),
    review: vi.fn(async () => undefined),
    merge: vi.fn(async () => undefined),
    resolveConflicts: vi.fn(async () => ({ status: "merged" })),
    setState: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const pullRequestService = mockOperations();
    registerPullRequestRoutes(app, config, { repoService, pullRequestService });

    const repo = repoService.create({
      userId: "user-1",
      name: "repo",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo",
    });

    const response = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/pull-requests?state=all`,
      headers: await authHeader(config.jwtSecret, "user-1"),
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));
    __jait_capture(2, (pullRequestService.list.mock.calls));

    const forbidden = await app.inject({
      method: "GET",
      url: `/api/repos/${repo.id}/pull-requests`,
      headers: await authHeader(config.jwtSecret, "user-2"),
    });
    __jait_capture(3, (forbidden.statusCode));
    __jait_capture(4, (pullRequestService.list.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_pull_requests_test_ts_151_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function mockOperations(): PullRequestOperations {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({
      number: 42,
      title: "Test PR",
      state: "OPEN",
      url: "https://github.com/acme/repo/pull/42",
      author: { login: "octocat", name: null },
      baseBranch: "main",
      headBranch: "feature",
      isDraft: false,
      reviewDecision: "",
      mergeStateStatus: "CLEAN",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      labels: [],
      checks: [],
      body: "",
      mergeable: "MERGEABLE",
      maintainerCanModify: true,
      comments: [],
      reviews: [],
      commits: [],
      files: [],
    })),
    diff: vi.fn(async () => ({ patch: "diff --git a/a b/a", truncated: false })),
    comment: vi.fn(async () => undefined),
    review: vi.fn(async () => undefined),
    merge: vi.fn(async () => undefined),
    resolveConflicts: vi.fn(async () => ({ status: "merged" })),
    setState: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const pullRequestService = mockOperations();
    registerPullRequestRoutes(app, config, { repoService, pullRequestService });

    const repo = repoService.create({
      userId: "user-1",
      name: "repo",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo",
    });
    const headers = await authHeader(config.jwtSecret, "user-1");
    const baseUrl = `/api/repos/${repo.id}/pull-requests/42`;

    const comment = await app.inject({
      method: "POST",
      url: `${baseUrl}/comments`,
      headers,
      payload: { body: "Ship it" },
    });
    const review = await app.inject({
      method: "POST",
      url: `${baseUrl}/reviews`,
      headers,
      payload: { event: "approve", body: "Looks good" },
    });
    const merge = await app.inject({
      method: "POST",
      url: `${baseUrl}/merge`,
      headers,
      payload: { method: "squash", deleteBranch: true },
    });
    const close = await app.inject({
      method: "PATCH",
      url: baseUrl,
      headers,
      payload: { state: "closed" },
    });

    __jait_capture(0, ([comment.statusCode, review.statusCode, merge.statusCode, close.statusCode]));
    __jait_capture(1, (pullRequestService.comment.mock.calls));
    __jait_capture(2, (pullRequestService.review.mock.calls));
    __jait_capture(3, (pullRequestService.merge.mock.calls));
    __jait_capture(4, (pullRequestService.setState.mock.calls));

    await app.close();
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_pull_requests_test_ts_223_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string) {
  const token = await signAuthToken({ id: userId, username: `${userId}-name` }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
function mockOperations(): PullRequestOperations {
  return {
    list: vi.fn(async () => []),
    get: vi.fn(async () => ({
      number: 42,
      title: "Test PR",
      state: "OPEN",
      url: "https://github.com/acme/repo/pull/42",
      author: { login: "octocat", name: null },
      baseBranch: "main",
      headBranch: "feature",
      isDraft: false,
      reviewDecision: "",
      mergeStateStatus: "CLEAN",
      additions: 1,
      deletions: 0,
      changedFiles: 1,
      createdAt: "2026-08-01T10:00:00Z",
      updatedAt: "2026-08-01T10:00:00Z",
      labels: [],
      checks: [],
      body: "",
      mergeable: "MERGEABLE",
      maintainerCanModify: true,
      comments: [],
      reviews: [],
      commits: [],
      files: [],
    })),
    diff: vi.fn(async () => ({ patch: "diff --git a/a b/a", truncated: false })),
    comment: vi.fn(async () => undefined),
    review: vi.fn(async () => undefined),
    merge: vi.fn(async () => undefined),
    resolveConflicts: vi.fn(async () => ({ status: "merged" })),
    setState: vi.fn(async () => undefined),
    update: vi.fn(async () => undefined),
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "test-jwt-secret", logLevel: "silent" };
    const repoService = new RepositoryService(db);
    const pullRequestService = mockOperations();
    registerPullRequestRoutes(app, config, { repoService, pullRequestService });

    const repo = repoService.create({
      userId: "user-1",
      name: "repo",
      localPath: process.cwd(),
      githubUrl: "https://github.com/acme/repo",
    });
    const headers = await authHeader(config.jwtSecret, "user-1");
    const baseUrl = `/api/repos/${repo.id}/pull-requests/42`;

    const prepare = await app.inject({
      method: "POST",
      url: `${baseUrl}/resolve-conflicts`,
      headers,
      payload: {},
    });
    __jait_capture(0, (prepare.statusCode));
    __jait_capture(1, (prepare.json()));
    __jait_capture(2, (pullRequestService.resolveConflicts.mock.calls));

    const apply = await app.inject({
      method: "POST",
      url: `${baseUrl}/resolve-conflicts`,
      headers,
      payload: { resolution: { "src/a.ts": "ours", "src/b.ts": "theirs" } },
    });
    __jait_capture(3, (apply.statusCode));
    __jait_capture(4, (pullRequestService.resolveConflicts.mock.calls));

    const invalid = await app.inject({
      method: "POST",
      url: `${baseUrl}/resolve-conflicts`,
      headers,
      payload: { resolution: { "src/a.ts": "neither" } },
    });
    __jait_capture(5, (invalid.statusCode));
    __jait_capture(6, (pullRequestService.resolveConflicts.mock.calls));

    await app.close();
    sqlite.close();
  
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
