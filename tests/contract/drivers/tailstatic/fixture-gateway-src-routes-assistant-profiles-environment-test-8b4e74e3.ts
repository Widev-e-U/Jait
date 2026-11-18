// Translated fixture from packages/gateway/src/routes/assistant-profiles-environment.test.ts; expected literals are in tail_static.rs.
import type { CliProviderAdapter, ProviderInfo, ProviderSession, StartSessionOptions } from "../../../../packages/gateway/src/providers/contracts.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createServer } from "../../../../packages/gateway/src/server.js";
import { AssistantProfileService } from "../../../../packages/gateway/src/services/assistant-profiles.js";
import { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ProjectService } from "../../../../packages/gateway/src/services/projects.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/assistant-profiles-environment.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_assistant_profiles_environment_test_ts_142_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return {
      id: "provider-session",
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(): Promise<void> {}
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(): () => void {
    return () => {};
  }
}
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
let projectService: ProjectService;
let assistantProfileService: AssistantProfileService;
let repoService: RepositoryService;
let sessionService: SessionService;
const __jait_hook_2364 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    userService = new UserService(opened.db);
    projectService = new ProjectService(opened.db);
    assistantProfileService = new AssistantProfileService(opened.db);
    repoService = new RepositoryService(opened.db);
    sessionService = new SessionService(opened.db);
    const audit = new AuditWriter(opened.db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockProvider());

    const ws = {
      registerGatewayFsNode: () => {},
      getNodeRegistry: () => ({
        version: 1,
        serverTime: new Date().toISOString(),
        nodes: [
          {
            id: "gateway",
            name: "Gateway",
            platform: "linux",
            role: "gateway",
            lifecycle: "ready",
            protocolVersion: 1,
            capabilities: {
              providers: ["codex"],
              surfaces: ["terminal", "filesystem"],
              tools: ["thread.control"],
              screenShare: false,
              voice: false,
              preview: true,
            },
            connectedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ],
      }),
      getFsNodes: () => [
        {
          id: "gateway",
          name: "Gateway",
          platform: "linux",
          clientId: "gateway",
          isGateway: true,
          providers: ["codex"],
          registeredAt: new Date().toISOString(),
        },
      ],
    } as any;

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      userService,
      sessionService,
      projectService,
      assistantProfileService,
      repoService,
      providerRegistry,
      ws,
      audit,
    });
  };
const __jait_hook_4243 = async () => {
    await app?.close();
    sqlite.close();
  };
await __jait_hook_2364();
try {
await (async()=>{

    const user = userService.createUser("assistant-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    const createRes = await app.inject({
      method: "POST",
      url: "/api/assistants/profiles",
      headers,
      payload: {
        name: "Operator",
        description: "Primary assistant",
        runtimeMode: "supervised",
        enabledSkills: ["coding-agent"],
      },
    });
    __jait_capture(0, (createRes.statusCode));
    const created = JSON.parse(createRes.body) as { profile: { id: string; isDefault: boolean; enabledSkills: string[] } };
    __jait_capture(1, (created.profile.isDefault));
    __jait_capture(2, (created.profile.enabledSkills));

    const secondRes = await app.inject({
      method: "POST",
      url: "/api/assistants/profiles",
      headers,
      payload: {
        name: "Network assistant",
        isDefault: true,
      },
    });
    __jait_capture(3, (secondRes.statusCode));
    const second = JSON.parse(secondRes.body) as { profile: { id: string; isDefault: boolean } };
    __jait_capture(4, (second.profile.isDefault));

    const listRes = await app.inject({
      method: "GET",
      url: "/api/assistants/profiles",
      headers,
    });
    __jait_capture(5, (listRes.statusCode));
    const listed = JSON.parse(listRes.body) as { profiles: Array<{ id: string; isDefault: boolean }> };
    __jait_capture(6, (listed.profiles));
    __jait_capture(7, (listed.profiles.find((profile) => profile.id === created.profile.id)?.isDefault));

    const updateRes = await app.inject({
      method: "PATCH",
      url: `/api/assistants/profiles/${created.profile.id}`,
      headers,
      payload: {
        toolProfile: "strict",
        enabledPlugins: ["calendar"],
      },
    });
    __jait_capture(8, (updateRes.statusCode));
    const updated = JSON.parse(updateRes.body) as { profile: { toolProfile: string | null; enabledPlugins: string[] } };
    __jait_capture(9, (updated.profile.toolProfile));
    __jait_capture(10, (updated.profile.enabledPlugins));
  
})();

} finally {
await __jait_hook_4243();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_assistant_profiles_environment_test_ts_200_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
class MockProvider implements CliProviderAdapter {
  readonly id = "codex";
  readonly info: ProviderInfo = {
    id: "codex",
    name: "Mock Codex",
    description: "Test provider",
    available: true,
    modes: ["full-access", "supervised"],
  };

  async checkAvailability(): Promise<boolean> {
    return true;
  }

  async startSession(options: StartSessionOptions): Promise<ProviderSession> {
    return {
      id: "provider-session",
      providerId: this.id,
      threadId: options.threadId,
      status: "running",
      runtimeMode: options.mode,
      startedAt: new Date().toISOString(),
    };
  }

  async sendTurn(): Promise<void> {}
  async interruptTurn(): Promise<void> {}
  async respondToApproval(): Promise<void> {}
  async stopSession(): Promise<void> {}
  onEvent(): () => void {
    return () => {};
  }
}
async function authHeaders(userId: string, username: string, jwtSecret: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>>;
let sqlite: Awaited<ReturnType<typeof openDatabase>>["sqlite"];
let userService: UserService;
let projectService: ProjectService;
let assistantProfileService: AssistantProfileService;
let repoService: RepositoryService;
let sessionService: SessionService;
const __jait_hook_2364 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);
    userService = new UserService(opened.db);
    projectService = new ProjectService(opened.db);
    assistantProfileService = new AssistantProfileService(opened.db);
    repoService = new RepositoryService(opened.db);
    sessionService = new SessionService(opened.db);
    const audit = new AuditWriter(opened.db);
    const providerRegistry = new ProviderRegistry();
    providerRegistry.register(new MockProvider());

    const ws = {
      registerGatewayFsNode: () => {},
      getNodeRegistry: () => ({
        version: 1,
        serverTime: new Date().toISOString(),
        nodes: [
          {
            id: "gateway",
            name: "Gateway",
            platform: "linux",
            role: "gateway",
            lifecycle: "ready",
            protocolVersion: 1,
            capabilities: {
              providers: ["codex"],
              surfaces: ["terminal", "filesystem"],
              tools: ["thread.control"],
              screenShare: false,
              voice: false,
              preview: true,
            },
            connectedAt: new Date().toISOString(),
            lastSeenAt: new Date().toISOString(),
          },
        ],
      }),
      getFsNodes: () => [
        {
          id: "gateway",
          name: "Gateway",
          platform: "linux",
          clientId: "gateway",
          isGateway: true,
          providers: ["codex"],
          registeredAt: new Date().toISOString(),
        },
      ],
    } as any;

    app = await createServer(testConfig, {
      db: opened.db,
      sqlite: opened.sqlite,
      userService,
      sessionService,
      projectService,
      assistantProfileService,
      repoService,
      providerRegistry,
      ws,
      audit,
    });
  };
const __jait_hook_4243 = async () => {
    await app?.close();
    sqlite.close();
  };
await __jait_hook_2364();
try {
await (async()=>{

    const user = userService.createUser("env-user", "password123");
    const headers = await authHeaders(user.id, user.username, testConfig.jwtSecret);

    assistantProfileService.create(user.id, {
      name: "Daily operator",
      enabledSkills: ["tmux"],
    });

    const project = projectService.create({
      userId: user.id,
      title: "Jait",
      rootPath: "/home/alice/jait",
      nodeId: "gateway",
    });

    sessionService.create({
      userId: user.id,
      projectId: project.id,
      projectPath: project.rootPath ?? undefined,
      name: "Main session",
    });

    repoService.create({
      userId: user.id,
      name: "Jait",
      localPath: "/home/alice/jait",
      defaultBranch: "main",
    });

    sqlite.prepare(`
      INSERT INTO network_hosts (ip, mac, hostname, os_version, open_ports, ssh_reachable, agent_status, providers, first_seen_at, last_seen_at, scanned_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      "192.168.1.20",
      null,
      "nas",
      "Linux",
      JSON.stringify([22, 443]),
      1,
      "running",
      JSON.stringify(["codex"]),
      "2026-03-26T00:00:00.000Z",
      "2026-03-26T00:00:00.000Z",
      "2026-03-26T00:00:00.000Z",
    );

    const res = await app.inject({
      method: "GET",
      url: "/api/environment/snapshot",
      headers,
    });
    __jait_capture(0, (res.statusCode));
    const body = JSON.parse(res.body) as {
      snapshot: {
        assistants: Array<{ name: string }>;
        nodes: Array<{ id: string }>;
        projects: Array<{ id: string; sessionCount: number }>;
        repositories: Array<{ name: string; connected: boolean }>;
        networkHosts: Array<{ hostname: string | null }>;
        connectors: Array<{ id: string; status: string }>;
      };
    };
    __jait_capture(1, (body.snapshot.assistants.map((profile) => profile.name)));
    __jait_capture(2, (body.snapshot.nodes.map((node) => node.id)));
    __jait_capture(3, (body.snapshot.projects.find((entry) => entry.id === project.id)?.sessionCount));
    __jait_capture(4, (body.snapshot.repositories.find((entry) => entry.name === "Jait")?.connected));
    __jait_captureType(5, (body.snapshot.networkHosts.find((host) => host.hostname === "nas")));
    __jait_capture(6, (body.snapshot.connectors.find((connector) => connector.id === "codex")?.status));
  
})();

} finally {
await __jait_hook_4243();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
