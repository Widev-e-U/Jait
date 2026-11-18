// Translated fixture from packages/gateway/src/services/agent-github-apps.test.ts; expected literals are in tail_static.rs.
import { generateKeyPairSync } from "node:crypto";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import type { JaitDB, SqliteDatabase } from "../../../../packages/gateway/src/db/connection.js";
import { UserSecretService } from "../../../../packages/gateway/src/services/user-secrets.js";
import { AgentGithubAppService, buildAppJwt } from "../../../../packages/gateway/src/services/agent-github-apps.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/agent-github-apps.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_118_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const setup = await service.beginSetup(USER_A, AGENT, { appName: "Nova", organization: "acme" });
    __jait_capture(0, (setup.postUrl));
    __jait_capture(1, (setup.redirectUrl));
    __jait_capture(2, (setup.manifest["default_permissions"]));
    __jait_capture(3, (setup.manifest["redirect_url"]));
    __jait_capture(4, (service.readState(setup.state)), ({ userId: USER_A, agentId: AGENT }));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_127_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const setup = await service.beginSetup(USER_A, AGENT, {
      appName: "Nova",
      baseUrl: "http://127.0.0.1:8000/",
    });

    __jait_capture(0, (setup.redirectUrl));
    __jait_capture(1, (setup.manifest["redirect_url"]));
    __jait_capture(2, (setup.manifest["callback_urls"]));
    __jait_capture(3, (setup.manifest["setup_url"]));
    __jait_capture(4, (setup.manifest["hook_attributes"]));
    __jait_capture(5, (JSON.stringify(setup.manifest)));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_141_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const previous = process.env["JAIT_PUBLIC_URL"];
    delete process.env["JAIT_PUBLIC_URL"];
    try {
      const local = makeService({ publicBaseUrl: "" });
      const setup = await local.beginSetup(USER_A, AGENT, {
        appName: "Nova",
        baseUrl: "http://127.0.0.1:8000/",
      });

      __jait_capture(0, (setup.redirectUrl));
      __jait_capture(1, (setup.manifest["hook_attributes"]));
    } finally {
      if (previous === undefined) delete process.env["JAIT_PUBLIC_URL"];
      else process.env["JAIT_PUBLIC_URL"] = previous;
    }
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_161_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const setup = await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    const [body] = setup.state.split(".");
    const forged = Buffer.from(JSON.stringify({ userId: USER_B, agentId: AGENT })).toString("base64")
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    __jait_captureType(0, (service.readState(`${forged}.${setup.state.split(".")[1]}`)));
    __jait_captureType(1, (service.readState(`${body}.deadbeef`)));
    __jait_captureType(2, (service.readState("garbage")));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_171_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await service.completeSetup(USER_A, AGENT, "temp-code");
    const connection = service.get(USER_A, AGENT)!;
    __jait_capture(0, (connection.appId));
    __jait_capture(1, (connection.appSlug));
    __jait_capture(2, (connection.botLogin));
    __jait_capture(3, (connection.hasPrivateKey));
    __jait_capture(4, (connection.status));
    __jait_capture(5, (JSON.stringify(connection)));
    const stored = secrets.list(USER_A, "github-app");
    __jait_capture(6, (stored));
    __jait_capture(7, (stored.every((record) => record.key.startsWith(`agent:${AGENT}`))));
    __jait_capture(8, (secrets.getValue(USER_A, "github-app", `agent:${AGENT}`)));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_186_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect();
    const connection = service.get(USER_A, AGENT)!;
    __jait_capture(0, (connection.status));
    __jait_capture(1, (connection.installationId));
    __jait_capture(2, (connection.accountLogin));
    __jait_capture(3, (connection.botLogin));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_195_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    await service.completeSetup(USER_A, AGENT, "temp-code");
    github.installationAppId = 99999;
    await __jait_rejected(0, service.attachInstallation(USER_A, AGENT, "777"));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_202_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect(USER_A, AGENT);
    await service.beginSetup(USER_B, OTHER_AGENT, { appName: "Ada" });
    await service.completeSetup(USER_B, OTHER_AGENT, "temp-code");

    __jait_captureType(0, (service.get(USER_A, OTHER_AGENT)));
    __jait_captureType(1, (service.get(USER_B, AGENT)));
    __jait_capture(2, (service.list(USER_A)));
    __jait_capture(3, (service.list(USER_A)[0]!.agentId), (AGENT));

    // USER_B must not be able to mint USER_A's agent identity.
    await __jait_rejected(4, service.mintInstallationToken(USER_B, AGENT));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_216_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect();
    let now = Date.now();
    // Fresh instance (empty token cache) but the same database row.
    const clocked = makeService({ now: () => now });
    const first = await clocked.mintInstallationToken(USER_A, AGENT);
    const second = await clocked.mintInstallationToken(USER_A, AGENT);
    __jait_capture(0, (second.token), (first.token));
    __jait_capture(1, (github.installationTokenRequests));

    now += 3_600_000;
    const third = await clocked.mintInstallationToken(USER_A, AGENT);
    __jait_capture(2, (third.token), (first.token));
    __jait_capture(3, (github.installationTokenRequests));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_232_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const jwt = buildAppJwt("12345", privateKey, Date.now());
    const [, payload] = jwt.split(".");
    const decoded = JSON.parse(Buffer.from(payload!.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8"));
    __jait_capture(0, (decoded.iss));
    __jait_capture(1, (decoded.exp - decoded.iat));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_240_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect();
    const result = await service.testConnection(USER_A, AGENT);
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.botLogin));
    __jait_capture(2, (result.repositoryCount));
    __jait_capture(3, (result.sampleRepositories));
    __jait_capture(4, (result.tokenPrefix));
    __jait_capture(5, (JSON.stringify(result)));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_251_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect();
    github.appDeleted = true;
    await __jait_rejected(0, service.verify(USER_A, AGENT));
    __jait_capture(1, (service.get(USER_A, AGENT)!.status));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_258_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const beforeConnect = await service.resolveAgentGithubEnv(USER_A, AGENT);
    __jait_captureType(0, (beforeConnect));

    // A personal forge token exists on the user's account.
    secrets.save({ userId: USER_A, type: "forge-token", key: "github.com", label: "personal PAT", value: "ghp_personal_token" });

    await connect();
    const env = await service.resolveAgentGithubEnv(USER_A, AGENT)!;
    __jait_capture(1, (env!["GH_TOKEN"]));
    __jait_capture(2, (env!["GITHUB_TOKEN"]), (env!["GH_TOKEN"]));
    __jait_capture(3, (env!["GITHUB_APP_BOT_LOGIN"]));
    __jait_capture(4, (env!["JAIT_GITHUB_IDENTITY"]));
    __jait_capture(5, (JSON.stringify(env)));

    // An agent without a connection resolves to no identity at all.
    __jait_captureType(6, (await service.resolveAgentGithubEnv(USER_A, OTHER_AGENT)));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_277_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await connect();
    __jait_capture(0, (service.disconnect(USER_A, AGENT).disconnected));
    __jait_captureType(1, (service.get(USER_A, AGENT)));
    __jait_capture(2, (secrets.list(USER_A, "github-app")));
    await __jait_rejected(3, service.mintInstallationToken(USER_A, AGENT));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_285_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    await service.beginSetup(USER_A, AGENT, { appName: "Nova" });
    await __jait_rejected(0, service.mintInstallationToken(USER_A, AGENT));
    await __jait_rejected(1, service.verify(USER_A, AGENT));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_agent_github_apps_test_ts_291_3": {


const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs1", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const USER_A = "user-a";
const USER_B = "user-b";
const AGENT = "agent-nova";
const OTHER_AGENT = "agent-ada";
function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}
interface FakeGithub {
  calls: Array<{ url: string; method: string; authorization: string | null }>;
  installationTokenRequests: number;
  appDeleted: boolean;
  installationAppId: number;
  fetch: typeof fetch;
}
function fakeGithub(): FakeGithub {
  const state: FakeGithub = {
    calls: [],
    installationTokenRequests: 0,
    appDeleted: false,
    installationAppId: 12345,
    fetch: undefined as unknown as typeof fetch,
  };
  state.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const authorization = new Headers(init?.headers).get("authorization");
    state.calls.push({ url, method, authorization });
    if (url.includes("/app-manifests/")) {
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", client_id: "Iv1.abc", pem: privateKey, webhook_secret: "whsec" });
    }
    if (url.endsWith("/app")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({ id: 12345, slug: "jait-nova", name: "Jait Nova", owner: { login: "jakob" } });
    }
    if (url.includes("/access_tokens")) {
      state.installationTokenRequests += 1;
      return json({
        token: `ghs_token_${state.installationTokenRequests}`,
        expires_at: new Date(Date.now() + 3_600_000).toISOString(),
        permissions: { contents: "write", pull_requests: "write" },
        repository_selection: "selected",
      });
    }
    if (url.includes("/installation/repositories")) {
      return json({ total_count: 2, repositories: [{ full_name: "acme/jait" }, { full_name: "acme/site" }] });
    }
    if (url.includes("/app/installations/")) {
      if (state.appDeleted) return json({ message: "Not Found" }, 404);
      return json({
        id: 777,
        app_id: state.installationAppId,
        app_slug: "jait-nova",
        account: { login: "acme", type: "Organization" },
        repository_selection: "selected",
        permissions: { contents: "write" },
      });
    }
    return json({ message: `Unhandled ${method} ${url}` }, 500);
  }) as typeof fetch;
  return state;
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: SqliteDatabase;
let secrets: UserSecretService;
let github: FakeGithub;
let service: AgentGithubAppService;
function makeService(overrides: { now?: () => number; publicBaseUrl?: string } = {}): AgentGithubAppService {
    return new AgentGithubAppService({
      db,
      userSecretService: secrets,
      fetchImpl: github.fetch,
      apiBaseUrl: "https://api.github.test",
      publicBaseUrl: "https://jait.test",
      stateSecret: "state-secret",
      ...overrides,
    });
  }
async function connect(userId = USER_A, agentId = AGENT): Promise<void> {
    await service.beginSetup(userId, agentId, { appName: `Nova ${agentId}` });
    await service.completeSetup(userId, agentId, "temp-code");
    await service.attachInstallation(userId, agentId, "777");
  }
const __jait_hook_3565 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    secrets = new UserSecretService(db, "test-encryption-secret");
    github = fakeGithub();
    service = makeService();
  };
const __jait_hook_3850 = () => {
    sqlite.close();
  };
await __jait_hook_3565();
try {
await (async()=>{

    const connection = await service.saveManualApp(USER_A, AGENT, { appId: "555", privateKey, appSlug: "manual-bot" });
    __jait_capture(0, (connection.appId));
    __jait_capture(1, (connection.botLogin));
    __jait_capture(2, (connection.status));
    await __jait_rejected(3, service.saveManualApp(USER_A, AGENT, { appId: "not-a-number", privateKey }));
    await __jait_rejected(4, service.saveManualApp(USER_A, AGENT, { appId: "556", privateKey: "nope" }));
  
})();

} finally {
await __jait_hook_3850();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
