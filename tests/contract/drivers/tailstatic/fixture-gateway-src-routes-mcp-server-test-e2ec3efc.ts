// Translated fixture from packages/gateway/src/routes/mcp-server.test.ts; expected literals are in tail_static.rs.

import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { TeamChatService } from "../../../../packages/gateway/src/services/team-chat.js";
import { createTeamChatTool } from "../../../../packages/gateway/src/tools/team-chat-tools.js";
import type { AppConfig } from "../../../../packages/gateway/src/config.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { UserQuestionService } from "../../../../packages/gateway/src/services/user-questions.js";
import { createUserAskTool } from "../../../../packages/gateway/src/tools/user-question-tools.js";
import { createTodoTool } from "../../../../packages/gateway/src/tools/core/todo.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import {
  handleMcpRequest,
  listToolsForMcp,
  registerMcpRoutes,
  resolveMcpBaseUrl,
} from "../../../../packages/gateway/src/routes/mcp-server.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/mcp-server.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_32_3_each0": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const authenticated = false;

try {
await (async()=>{

    const owner = "browser-owner";
    const personal = { id: "personal-chat", userId: owner, projectPath: null };
    const project = { id: "project-chat", userId: owner, projectPath: "/project" };
    let active = project;
    const sessionService = {
      lastActive: vi.fn(() => active),
      getById: vi.fn((id: string) => id === personal.id ? personal : project),
    } as unknown as SessionService;
    const execute = vi.fn(async (_input: unknown, context: ToolContext) => ({
      ok: true, message: "browser opened", data: { sessionId: context.sessionId },
    }));
    const registry = new ToolRegistry();
    for (const name of ["browser.navigate", "browser.handoff", "preview.open", "surfaces.start"]) {
      registry.register({ name, description: "Browser session routing test", tier: "standard",
        category: name === "surfaces.start" ? "surfaces" : "browser", source: "builtin",
        parameters: { type: "object", properties: {} }, execute });
    }
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, { toolRegistry: registry, sessionService,
      config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig });
    const headers = authenticated
      ? { authorization: `Bearer ${await signAuthToken({ id: owner, username: owner }, "test-secret")}` } : {};
    for (const endpoint of ["/mcp", "/mcp/sse"]) {
      for (const name of ["browser_navigate", "browser_handoff", "preview_open", "surfaces_start"]) {
        const payload = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { type: "browser" } } };
        const unbound = await app.inject({ method: "POST", url: endpoint, headers, payload });
        __jait_capture(0, (unbound.json()));
        __jait_capture(1, (JSON.stringify(unbound.json())));
        __jait_capture(2, (execute.mock.calls));
        // A newer project conversation, or switching the last-active chat, must
        // never move browser actions or their handoff away from this personal chat.
        for (const selected of [project, personal, project]) {
          active = selected;
          const bound = await app.inject({ method: "POST", url: `${endpoint}?sessionId=${personal.id}`, headers, payload });
          __jait_capture(3, (bound.json()));
          __jait_capture(4, (execute.mock.calls.at(-1)?.[1].sessionId), (personal.id));
        }
        execute.mockClear();
      }
    }
  
})();

} finally {
await __jait_hook_1102();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_32_3_each1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const authenticated = true;

try {
await (async()=>{

    const owner = "browser-owner";
    const personal = { id: "personal-chat", userId: owner, projectPath: null };
    const project = { id: "project-chat", userId: owner, projectPath: "/project" };
    let active = project;
    const sessionService = {
      lastActive: vi.fn(() => active),
      getById: vi.fn((id: string) => id === personal.id ? personal : project),
    } as unknown as SessionService;
    const execute = vi.fn(async (_input: unknown, context: ToolContext) => ({
      ok: true, message: "browser opened", data: { sessionId: context.sessionId },
    }));
    const registry = new ToolRegistry();
    for (const name of ["browser.navigate", "browser.handoff", "preview.open", "surfaces.start"]) {
      registry.register({ name, description: "Browser session routing test", tier: "standard",
        category: name === "surfaces.start" ? "surfaces" : "browser", source: "builtin",
        parameters: { type: "object", properties: {} }, execute });
    }
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, { toolRegistry: registry, sessionService,
      config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig });
    const headers = authenticated
      ? { authorization: `Bearer ${await signAuthToken({ id: owner, username: owner }, "test-secret")}` } : {};
    for (const endpoint of ["/mcp", "/mcp/sse"]) {
      for (const name of ["browser_navigate", "browser_handoff", "preview_open", "surfaces_start"]) {
        const payload = { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: { type: "browser" } } };
        const unbound = await app.inject({ method: "POST", url: endpoint, headers, payload });
        __jait_capture(0, (unbound.json()));
        __jait_capture(1, (JSON.stringify(unbound.json())));
        __jait_capture(2, (execute.mock.calls));
        // A newer project conversation, or switching the last-active chat, must
        // never move browser actions or their handoff away from this personal chat.
        for (const selected of [project, personal, project]) {
          active = selected;
          const bound = await app.inject({ method: "POST", url: `${endpoint}?sessionId=${personal.id}`, headers, payload });
          __jait_capture(3, (bound.json()));
          __jait_capture(4, (execute.mock.calls.at(-1)?.[1].sessionId), (personal.id));
        }
        execute.mockClear();
      }
    }
  
})();

} finally {
await __jait_hook_1102();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_76_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const service = new UserQuestionService();
      const registry = new ToolRegistry();
      registry.register(createUserAskTool(service));
      const call = (args: unknown) => handleMcpRequest({
        jsonrpc: "2.0", id: 1, method: "tools/call",
        params: { name: "user_ask", arguments: args },
      }, registry, undefined, { sessionId: "session-1", userId: "user-1" });
      const first = call({ questions: [{ id: "choice", header: "Choice", question: "Which one?" }] });
      await vi.advanceTimersByTimeAsync(60_000);
      const response = await first;
      __jait_capture(0, (response));
      const [request] = service.listPending();
      __jait_capture(1, (JSON.stringify(response)), (request!.id));
      await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);
      __jait_capture(2, (service.submit(request!.id, { answers: { choice: { selected: ["yes"], freeText: null, skipped: false } } }, "user-1")));
      const answer = await call({ requestId: request!.id });
      __jait_capture(3, (answer));
      __jait_capture(4, (JSON.stringify(answer)));
      __jait_capture(5, (service.listPending()));
      __jait_capture(6, (vi.getTimerCount()));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_104_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    appsToClose.push(app);
    const questions = new UserQuestionService();
    const registry = new ToolRegistry();
    const mutate = vi.fn(async () => ({ ok: true, message: "changed" }));
    registry.register({ name: "file.write", tier: "standard", category: "filesystem", source: "builtin",
      description: "Test mutation", parameters: { type: "object", properties: {} }, execute: mutate });
    registry.register(createUserAskTool(questions));
    registerMcpRoutes(app, { toolRegistry: registry, userQuestionService: questions,
      config: { host: "127.0.0.1", port: 3000 } as AppConfig });
    const call = async (sessionId: string, name: string, args = {}) => (await app.inject({
      method: "POST", url: `/mcp?sessionId=${sessionId}`,
      payload: { jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } },
    })).json();
    const id = questions.startResumable({ sessionId: "waiting-chat", questions: [], requestedBy: "user.ask" });
    const blocked = await call("waiting-chat", "file_write");
    __jait_capture(0, (blocked.result.isError));
    __jait_capture(1, (JSON.stringify(blocked)), (id));
    __jait_capture(2, (mutate.mock.calls));
    __jait_capture(3, ((await call("another-chat", "file_write")).result.isError));
    __jait_capture(4, (mutate.mock.calls));
    questions.submit(id, { answers: {} });
    __jait_capture(5, ((await call("waiting-chat", "user_ask", { requestId: id })).result.isError));
    __jait_capture(6, ((await call("waiting-chat", "file_write")).result.isError));
    __jait_capture(7, (mutate.mock.calls));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_132_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    for (const [name, tier] of [
      ["todo", "core"],
      ["user.ask", "core"],
      ["tools.search", "core"],
      ["jait.terminal", "standard"],
      ["terminal.run", "standard"],
    ] as const) {
      registry.register({
        name,
        description: name,
        tier,
        category: tier === "core" ? "meta" : "terminal",
        source: "builtin",
        parameters: { type: "object", properties: {} },
        async execute() {
          return { ok: true, message: "ok" };
        },
      });
    }

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const listTools = async (toolSet: string) => {
      const response = await app.inject({
        method: "POST",
        url: `/mcp?toolSet=${toolSet}`,
        payload: { jsonrpc: "2.0", id: 1, method: "tools/list", params: {} },
      });
      return response.json().result.tools.map((tool: { name: string }) => tool.name);
    };

    __jait_capture(0, (await listTools("core")));
    __jait_capture(1, (await listTools("deferred")));

    const crossCatalogCall = await app.inject({
      method: "POST",
      url: "/mcp?toolSet=core&sessionId=session-1",
      payload: {
        jsonrpc: "2.0",
        id: 2,
        method: "tools/call",
        params: { name: "terminal_run", arguments: {} },
      },
    });
    __jait_capture(2, (crossCatalogCall.json()));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_191_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "read",
      description: "Core read tool",
      tier: "core",
      category: "filesystem",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "jait.todos",
      description: "Manage global Jait todo items",
      tier: "core",
      category: "gateway",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          action: { type: "string", enum: ["list", "add", "update", "remove"] },
          todoId: { type: "string" },
        },
        required: ["action"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "user.ask",
      description: "Ask the user one or more structured questions",
      tier: "core",
      category: "gateway",
      source: "builtin",
      risk: "low",
      parameters: {
        type: "object",
        properties: {
          questions: { type: "array" },
        },
        required: ["questions"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "cron.add",
      description: "Create a cron job",
      tier: "standard",
      category: "scheduler",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          name: { type: "string" },
        },
        required: ["name"],
      },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });
    registry.register({
      name: "mcp.github.create_issue",
      description: "External MCP tool",
      tier: "external",
      category: "external",
      source: "mcp",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    __jait_capture(0, (listToolsForMcp(registry).map((tool) => tool.name)));

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, registry);

    __jait_capture(1, (response));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_333_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register(createTodoTool());
    registry.register({
      name: "jait.terminal",
      displayName: "Terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/list",
    }, registry);

    __jait_capture(0, ((response.result as { tools: Array<Record<string, unknown>> }).tools));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_361_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (resolveMcpBaseUrl({
      headers: {
        "x-forwarded-proto": "https",
        "x-forwarded-host": "gateway.example.com",
        host: "ignored.local:3000",
      },
      protocol: "http",
      hostname: "ignored.local",
    }, { host: "0.0.0.0", port: 3000 })));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_373_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (resolveMcpBaseUrl({
      headers: {
        host: "127.0.0.1:4111",
      },
      protocol: "http",
      hostname: "127.0.0.1",
    }, { host: "0.0.0.0", port: 3000 })));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_383_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-03-26",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.headers["mcp-protocol-version"]));
    __jait_capture(2, (response.json()));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_431_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp/sse",
      headers: {
        "content-type": "application/json",
        "mcp-protocol-version": "2025-03-26",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "initialize",
        params: {
          protocolVersion: "2025-03-26",
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_473_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute(_input, context) {
        context.onOutputChunk?.("first\n");
        context.onOutputChunk?.("second\n");
        return { ok: true, message: "done" };
      },
    });
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=session-1&projectRoot=%2Ftmp%2Fproject",
      headers: {
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "jait_terminal",
          arguments: { command: "bun test" },
          _meta: { progressToken: "progress-1" },
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.headers["content-type"]));
    __jait_capture(2, (response.body));
    __jait_capture(3, (response.body));
    __jait_capture(4, (response.body));
    __jait_capture(5, (response.body));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_522_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const directExecute = vi.fn(async () => ({ ok: true, message: "direct execution" }));
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      execute: directExecute,
    });
    const toolExecutor = vi.fn(async () => ({ ok: true, message: "remote execution" }));
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      toolExecutor,
      config: { host: "127.0.0.1", port: 3000 } as any,
    });

    const projectRoot = "E:\\TimeToAct\\EVN\\FSM.FunctionApps";
    const response = await app.inject({
      method: "POST",
      url: `/mcp?sessionId=remote-session&projectRoot=${encodeURIComponent(projectRoot)}`,
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "jait_terminal", arguments: { command: "pwd" } },
      },
    });

    __jait_capture(0, (response.json()));
    __jait_capture(1, (toolExecutor.mock.calls), ([projectRoot]));
    __jait_capture(2, (directExecute.mock.calls));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_573_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        method: "notifications/initialized",
        params: {},
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_602_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      userId?: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
      registry,
      "2025-03-26",
      {
        sessionId: "web-session-123",
        projectRoot: "/tmp/project",
        providerId: "codex",
        model: "gpt-5-codex",
        runtimeMode: "supervised",
      },
    );

    __jait_capture(0, (response));
    __jait_capture(1, (capturedContext));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_672_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const chunks: string[] = [];
    registry.register({
      name: "jait.terminal",
      description: "Run a command",
      tier: "standard",
      category: "terminal",
      source: "builtin",
      parameters: { type: "object", properties: { command: { type: "string" } }, required: ["command"] },
      async execute(_input, context) {
        context.onOutputChunk?.("first\n");
        context.onOutputChunk?.("second\n");
        return { ok: true, message: "done" };
      },
    });

    await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: { name: "jait_terminal", arguments: { command: "bun test" } },
      },
      registry,
      "2025-03-26",
      { sessionId: "session-1", projectRoot: "/tmp/project" },
      undefined,
      (chunk) => chunks.push(chunk),
    );

    __jait_capture(0, (chunks));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_706_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute() {
        return { ok: true, message: "ok" };
      },
    });

    const response = await handleMcpRequest(
      {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
      registry,
      "2025-03-26",
      {},
    );

    __jait_capture(0, (response));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_748_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const sessionService = new SessionService(db);
    const registry = new ToolRegistry();
    const userId = "user-123";
    const session = sessionService.create({
      userId,
      name: "Active Session",
      projectPath: "/tmp/current-project",
    });
    const token = await signAuthToken({ id: userId, username: "alice" }, "test-secret");
    let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

    registry.register({
      name: "surfaces.start",
      description: "Start a surface",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          type: { type: "string" },
        },
        required: ["type"],
      },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      sessionService,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.start",
          arguments: { type: "filesystem" },
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (capturedContext), ({
      sessionId: session.id,
      projectRoot: "/tmp/current-project",
      userId,
    }));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_823_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const registry = new ToolRegistry();
      const session = sessionService.create({
        name: "Local MCP Session",
        projectPath: "/tmp/local-project",
      });
      let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

      registry.register({
        name: "memory.search",
        description: "Search memory",
        tier: "standard",
        category: "memory",
        source: "builtin",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string" },
          },
          required: ["query"],
        },
        async execute(_input, context) {
          capturedContext = {
            sessionId: context.sessionId,
            projectRoot: context.projectRoot,
            userId: context.userId,
          };
          return { ok: true, message: "ok" };
        },
      });

      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: "/mcp",
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "memory.search",
            arguments: { query: "salary consulting" },
          },
        },
      });

      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (capturedContext), ({
        sessionId: session.id,
        projectRoot: "/tmp/local-project",
        userId: undefined,
      }));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_898_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const token = await signAuthToken({ id: "user-456", username: "alice" }, "test-secret");
    let capturedContext: { sessionId: string; projectRoot: string; userId?: string } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=query-session&projectRoot=%2Ftmp%2Fquery-project",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${token}`,
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (capturedContext));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_957_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      userId?: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "surfaces.list",
      description: "List surfaces",
      tier: "standard",
      category: "surfaces",
      source: "builtin",
      parameters: { type: "object", properties: {} },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          userId: context.userId,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp?sessionId=query-session&projectRoot=%2Ftmp%2Fquery-project&providerId=codex&model=gpt-5-codex&runtimeMode=supervised",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "surfaces.list",
          arguments: {},
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (capturedContext));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_1027_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    let capturedContext: {
      sessionId: string;
      projectRoot: string;
      providerId?: string;
      model?: string;
      runtimeMode?: string;
    } | null = null;

    registry.register({
      name: "memory.save",
      description: "Save memory",
      tier: "standard",
      category: "memory",
      source: "builtin",
      parameters: {
        type: "object",
        properties: {
          content: { type: "string" },
          sessionId: { type: "string" },
          projectRoot: { type: "string" },
          providerId: { type: "string" },
          model: { type: "string" },
          runtimeMode: { type: "string" },
        },
        required: ["content"],
      },
      async execute(_input, context) {
        capturedContext = {
          sessionId: context.sessionId,
          projectRoot: context.projectRoot,
          providerId: context.providerId,
          model: context.model,
          runtimeMode: context.runtimeMode,
        };
        return { ok: true, message: "ok" };
      },
    });

    const app = Fastify();
    appsToClose.push(app);
    registerMcpRoutes(app, {
      toolRegistry: registry,
      config: {
        host: "127.0.0.1",
        port: 3000,
        jwtSecret: "test-secret",
      } as any,
    });

    const response = await app.inject({
      method: "POST",
      url: "/mcp",
      headers: {
        "content-type": "application/json",
      },
      payload: {
        jsonrpc: "2.0",
        id: 1,
        method: "tools/call",
        params: {
          name: "memory.save",
          arguments: {
            content: "remember this",
            sessionId: "argument-session",
            projectRoot: "/tmp/argument-project",
            providerId: "codex",
            model: "gpt-5-codex",
            runtimeMode: "supervised",
          },
        },
      },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (capturedContext));
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_1112_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const userService = new UserService(db);
      const sessionState = new SessionStateService(db);
      const user = userService.createUser("codex-owner", "password123");
      // Account-level default is a decoy: autonomous/MCP turns must never
      // inherit it — only the selection the user recorded on this chat counts.
      userService.updateSettings(user.id, { chatProvider: "openrouter" });
      const session = sessionService.create({
        userId: user.id,
        name: "Codex Session",
        projectPath: "/tmp/current-project",
      });
      sessionState.set(session.id, {
        "chat.provider": "codex",
        "chat.providerRuntimeMode": "supervised",
        "chat.cliModels": { codex: "gpt-5-codex", openrouter: "anthropic/claude-sonnet-4" },
      });

      const registry = new ToolRegistry();
      let capturedContext: {
        sessionId: string;
        projectRoot: string;
        userId?: string;
        providerId?: string;
        model?: string;
        runtimeMode?: string;
      } | null = null;

      registry.register({
        name: "surfaces.list",
        description: "List surfaces",
        tier: "standard",
        category: "surfaces",
        source: "builtin",
        parameters: { type: "object", properties: {} },
        async execute(_input, context) {
          capturedContext = {
            sessionId: context.sessionId,
            projectRoot: context.projectRoot,
            userId: context.userId,
            providerId: context.providerId,
            model: context.model,
            runtimeMode: context.runtimeMode,
          };
          return { ok: true, message: "ok" };
        },
      });

      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        userService,
        sessionState,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: `/mcp?sessionId=${encodeURIComponent(session.id)}`,
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "surfaces.list",
            arguments: {},
          },
        },
      });

      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (capturedContext), ({
        sessionId: session.id,
        projectRoot: "/tmp/current-project",
        userId: user.id,
        providerId: "codex",
        model: "gpt-5-codex",
        runtimeMode: "supervised",
      }));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_1209_3_each0": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const endpoint = "/mcp";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      // The most recent chat belongs to someone else; worker calls must keep
      // their own durable identity rather than adopting global chat defaults.
      sessionService.create({ userId: "other-user", name: "Unrelated chat" });
      const thread = threadService.create({
        userId: "worker-owner",
        personaAgentId: "developer",
        title: "Worker preflight",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
        workingDirectory: "/project/worker",
      });
      let capturedContext: ToolContext | undefined;
      const registry = new ToolRegistry();
      registry.register({
        name: "agent.github",
        description: "Inspect worker identity",
        parameters: { type: "object", properties: {} },
        async execute(_input, context) {
          capturedContext = context;
          return context.userId
            ? { ok: true, message: "Authenticated worker" }
            : { ok: false, message: "Authenticated user required." };
        },
      });
      registry.register(createTeamChatTool(new TeamChatService(db, sessionService, threadService), sessionService));
      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry, sessionService, threadService,
        config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig,
      });
      const response = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      __jait_capture(0, (response.json().result));
      __jait_capture(1, (capturedContext), ({
        sessionId: thread.id,
        threadId: thread.id,
        userId: "worker-owner",
        projectRoot: "/project/worker",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
      }));
      const teamResponse = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "team_chat", arguments: { action: "list" } },
        },
      });
      __jait_capture(2, (teamResponse.json().result));

      const token = await signAuthToken({ id: "other-user", username: "other" }, "test-secret");
      await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      __jait_capture(3, (capturedContext?.userId));
      __jait_captureType(4, (capturedContext?.threadId));
      __jait_captureType(5, (capturedContext?.providerId));
      __jait_capture(6, (capturedContext?.projectRoot));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_1209_3_each1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const endpoint = "/mcp/sse";

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      // The most recent chat belongs to someone else; worker calls must keep
      // their own durable identity rather than adopting global chat defaults.
      sessionService.create({ userId: "other-user", name: "Unrelated chat" });
      const thread = threadService.create({
        userId: "worker-owner",
        personaAgentId: "developer",
        title: "Worker preflight",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
        workingDirectory: "/project/worker",
      });
      let capturedContext: ToolContext | undefined;
      const registry = new ToolRegistry();
      registry.register({
        name: "agent.github",
        description: "Inspect worker identity",
        parameters: { type: "object", properties: {} },
        async execute(_input, context) {
          capturedContext = context;
          return context.userId
            ? { ok: true, message: "Authenticated worker" }
            : { ok: false, message: "Authenticated user required." };
        },
      });
      registry.register(createTeamChatTool(new TeamChatService(db, sessionService, threadService), sessionService));
      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry, sessionService, threadService,
        config: { host: "127.0.0.1", port: 3000, jwtSecret: "test-secret" } as AppConfig,
      });
      const response = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 1, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      __jait_capture(0, (response.json().result));
      __jait_capture(1, (capturedContext), ({
        sessionId: thread.id,
        threadId: thread.id,
        userId: "worker-owner",
        projectRoot: "/project/worker",
        providerId: "codex",
        model: "gpt-5.5",
        runtimeMode: "supervised",
      }));
      const teamResponse = await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        payload: {
          jsonrpc: "2.0", id: 2, method: "tools/call",
          params: { name: "team_chat", arguments: { action: "list" } },
        },
      });
      __jait_capture(2, (teamResponse.json().result));

      const token = await signAuthToken({ id: "other-user", username: "other" }, "test-secret");
      await app.inject({
        method: "POST",
        url: `${endpoint}?sessionId=${thread.id}`,
        headers: { authorization: `Bearer ${token}` },
        payload: {
          jsonrpc: "2.0", id: 3, method: "tools/call",
          params: { name: "agent_github", arguments: {} },
        },
      });
      __jait_capture(3, (capturedContext?.userId));
      __jait_captureType(4, (capturedContext?.threadId));
      __jait_captureType(5, (capturedContext?.providerId));
      __jait_capture(6, (capturedContext?.projectRoot));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_mcp_server_test_ts_1297_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
let appsToClose: Array<ReturnType<typeof Fastify>> = [];
const __jait_hook_1102 = async () => {
  await Promise.all(appsToClose.map((app) => app.close()));
  appsToClose = [];
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const sessionState = new SessionStateService(db);
      const userService = new UserService(db);
      const user = userService.createUser("mcp-todo-user", "password123");
      const session = sessionService.create({
        userId: user.id,
        name: "MCP Todo Session",
        projectPath: "/tmp/mcp-project",
      });

      const registry = new ToolRegistry();
      registry.register(createTodoTool());

      const wsEvents: Array<{ type: string; sessionId: string; payload?: unknown }> = [];
      const app = Fastify();
      appsToClose.push(app);
      registerMcpRoutes(app, {
        toolRegistry: registry,
        sessionService,
        userService,
        sessionState,
        ws: {
          broadcast(sessionId, event) {
            wsEvents.push({
              type: event.type,
              sessionId,
              payload: "payload" in event ? event.payload : undefined,
            });
          },
          broadcastAll() {},
        } as any,
        config: {
          host: "127.0.0.1",
          port: 3000,
          jwtSecret: "test-secret",
        } as any,
      });

      const response = await app.inject({
        method: "POST",
        url: `/mcp?sessionId=${encodeURIComponent(session.id)}`,
        headers: {
          "content-type": "application/json",
        },
        payload: {
          jsonrpc: "2.0",
          id: 1,
          method: "tools/call",
          params: {
            name: "todo",
            arguments: {
              todoList: [
                { id: 1, title: "Trace MCP sync", status: "in-progress" },
                { id: 2, title: "Verify todo render", status: "not-started" },
              ],
            },
          },
        },
      });

      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (sessionState.get(session.id, ["todo_list"])));
      __jait_capture(2, (wsEvents), ([
        {
          type: "ui.state-sync",
          sessionId: session.id,
          payload: {
            key: "todo_list",
            value: [
              { id: 1, title: "Trace MCP sync", status: "in-progress" },
              { id: 2, title: "Verify todo render", status: "not-started" },
            ],
          },
        },
      ]));
    } finally {
      sqlite.close();
    }
  
})();

} finally {
await __jait_hook_1102();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
