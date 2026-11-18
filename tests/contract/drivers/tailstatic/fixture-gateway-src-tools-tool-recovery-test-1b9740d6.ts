// Translated fixture from packages/gateway/src/tools/tool-recovery.test.ts; expected literals are in tail_static.rs.
import { runAgentLoop, toolDefsToSchemas, fromOpenAIName, type AgentMessage } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createTeamChatTool } from "../../../../packages/gateway/src/tools/team-chat-tools.js";
import type { TeamChatService } from "../../../../packages/gateway/src/services/team-chat.js";
import type { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/tool-recovery.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_18_3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("tools_search", { query: "GitHub token" }),
      response("agent_github_token"),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string) => name === "tools.search"
      ? { ok: true, message: "Found token tool", data: { matches: [{ name: "agent.github.token", description: "Mint token", parameters: { type: "object", properties: {} } }] } }
      : { ok: name === "agent.github.token", message: name });
    await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history: [{ role: "system", content: "Use tools" }, { role: "user", content: "Get the GitHub token" }],
      toolSchemas: toolDefsToSchemas([{ name: "tools.search", description: "Search tools", parameters: { type: "object", properties: {} } }]),
      hasTools: true, sessionId: "discovery-repro", abort: new AbortController(), maxRounds: 5,
    }, execute);
    __jait_capture(0, (execute.mock.calls.map(call => call[0])));
  
})();

} finally {
await __jait_hook_398();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_37_3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (fromOpenAIName("unknown_tool_with_underscores")));
    __jait_capture(1, (fromOpenAIName("custom.tool_with_underscores")));
  
})();

} finally {
await __jait_hook_398();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_42_3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("unknown_recovery_tool", { value: "bad" }),
      response("unknown_recovery_tool", { value: "bad" }),
      response("read", { path: "fixed.md" }),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string) => name === "read"
      ? { ok: true, message: "Read succeeded" }
      : { ok: false, message: "Unknown tool: " + name });
    const history: AgentMessage[] = [{ role: "system", content: "Use tools" }, { role: "user", content: "Read the file" }];
    await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history, toolSchemas: toolDefsToSchemas([{ name: "read", description: "Read", parameters: { type: "object", properties: {} } }]),
      hasTools: true, sessionId: "invalid-retry-repro", abort: new AbortController(), maxRounds: 6,
    }, execute);
    __jait_capture(0, (execute.mock.calls.map(call => call[0])));
    __jait_capture(1, (history.some(entry => entry.role === "tool" && entry.content.includes("Change the tool name or arguments"))));
  
})();

} finally {
await __jait_hook_398();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_63_3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const room = { id: "room" };
    const service = { workForSession: vi.fn(), get: vi.fn().mockReturnValue(room), sender: vi.fn(),
      setGoal: vi.fn().mockReturnValue(room) };
    const registry = new ToolRegistry();
    const tool = createTeamChatTool(service as unknown as TeamChatService, {} as SessionService);
    registry.register(tool);
    let round = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => [
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars" }),
      response("team_chat", { action: "goal", roomId: "room", content: "Show avatars", criteria: ["Mention shows avatar"] }),
      response(),
    ][round++]!);
    const execute = vi.fn(async (name: string, input: unknown) => registry.execute(name, input, {
      userId: "owner", sessionId: "goal-recovery", actionId: "test", projectRoot: "/project", requestedBy: "test",
    }));
    const history: AgentMessage[] = [{ role: "system", content: "Use tools" }, { role: "user", content: "Set the goal" }];
    const result = await runAgentLoop({
      llm: { openaiApiKey: "test", openaiBaseUrl: "https://llm.test", openaiModel: "test", contextWindow: 100000 },
      history, toolRegistry: registry, toolSchemas: toolDefsToSchemas([tool]),
      hasTools: true, sessionId: "goal-recovery", abort: new AbortController(), maxRounds: 6,
    }, execute);
    __jait_capture(0, (execute.mock.calls));
    __jait_capture(1, (service.setGoal.mock.calls));
    __jait_capture(2, (result.executedToolCalls.map(call => call.ok)));
    __jait_capture(3, (result.executedToolCalls[1]?.message));
  
})();

} finally {
await __jait_hook_398();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_93_3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const first = { name: "recovery.a_b", description: "first", parameters: { type: "object" as const, properties: {} },
      execute: async () => ({ ok: true, message: "first" }) };
    const second = { ...first, name: "recovery_a.b" };

    // Registration must never fail: the registry legitimately exposes legacy
    // alias pairs such as `os.tool` / `os_tool`, and a collision is not fatal.
    registry.register(first);
    registry.register(second);

    // Only one schema reaches the provider, so no duplicate function is advertised.
    const schemas = toolDefsToSchemas([first, second]);
    const names = schemas.map(schema => schema.function.name);
    __jait_capture(0, (names));

    // The advertised alias always resolves to a registered, executable tool.
    const resolved = fromOpenAIName(names[0]!);
    __jait_capture(1, (["recovery.a_b", "recovery_a.b"]), (resolved));
    __jait_capture(2, (registry.isExecutable(resolved)));
  
})();

} finally {
await __jait_hook_398();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each0": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = undefined;

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each1": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = undefined;

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each2": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = "";

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each3": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = " ";

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each4": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = null;

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each5": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = Array(21).fill("criterion");

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_tool_recovery_test_ts_115_3_each6": {


function response(name?: string, args: unknown = {}) {
  const delta = name
    ? { tool_calls: [{ index: 0, id: "call-" + name, type: "function", function: { name, arguments: JSON.stringify(args) } }] }
    : { content: "Finished." };
  return new Response('data: ' + JSON.stringify({ choices: [{ delta, finish_reason: name ? "tool_calls" : "stop" }] }) + '\n\ndata: [DONE]\n\n', { headers: { "content-type": "text/event-stream" } });
}
const __jait_hook_398 = () => vi.restoreAllMocks();
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const criteria = "x".repeat(2001);

try {
await (async()=>{

    const service = { workForSession: vi.fn(), get: vi.fn(), sender: vi.fn(), setGoal: vi.fn(() => { throw new Error("A goal needs explicit acceptance criteria."); }) };
    const registry = new ToolRegistry();
    registry.register(createTeamChatTool(service as unknown as TeamChatService, {} as SessionService));
    const result = await registry.execute("team.chat", { action: "goal", roomId: "room", content: "Show avatars", criteria }, {
      userId: "owner", sessionId: "test", actionId: "test", projectRoot: "/project", requestedBy: "test",
    });
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (service.workForSession.mock.calls));
    __jait_capture(3, (service.setGoal.mock.calls));
  
})();

} finally {
await __jait_hook_398();
}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
