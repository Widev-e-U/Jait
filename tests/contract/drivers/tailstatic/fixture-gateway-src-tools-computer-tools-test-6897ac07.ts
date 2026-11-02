// Translated fixture from packages/gateway/src/tools/computer-tools.test.ts; expected literals are in tail_static.rs.
import type { NodeState } from "@jait/shared";
import type { ScreenShareService } from "@jait/screen-share";
import { ComputerControlSessionService } from "../../../../packages/gateway/src/services/computer-control.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { createComputerTools } from "../../../../packages/gateway/src/tools/computer-tools.js";
import type { ToolContext, ToolDefinition } from "../../../../packages/gateway/src/tools/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/computer-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_66_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const oldNode = windowsNode({
      id: "old-windows",
      capabilities: {
        ...windowsNode().capabilities,
        tools: ["terminal.run"],
      },
    });
    const { tools } = setup([windowsNode(), oldNode, windowsNode({ id: "linux-a", platform: "linux" })]);

    const result = await tool<Record<string, never>>(tools, "computer.targets").execute({}, context);
    const targets = (result.data as { targets: Array<{ nodeId: string; available: boolean; reason?: string }> }).targets;

    __jait_capture(0, (targets));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_86_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const f = setup();
    const share = { chatId: "chat-a", controlOwner: "user", pendingApproval: false, status: "sharing" };
    const screenShare = { getSessionsForNode: () => [share] } as unknown as ScreenShareService;
    const tools = new Map(createComputerTools(f.ws, f.sessions, screenShare).map(item => [item.name, item] as const));
    const sessionTool = tool<{ action: "start"; nodeId: string }>(tools, "computer.session");
    __jait_capture(0, ((await sessionTool.execute({ action: "start", nodeId: "windows-a" }, context)).ok));
    __jait_capture(1, (f.proxyToolOp.mock.calls));
    share.controlOwner = "agent";
    const started = await sessionTool.execute({ action: "start", nodeId: "windows-a" }, context);
    __jait_capture(2, (started.ok));
    const sessionId = (started.data as { session: { id: string } }).session.id;
    share.controlOwner = "user";
    const count = f.proxyToolOp.mock.calls.length;
    const action = await tool<Record<string, unknown>>(tools, "computer.act").execute({ sessionId, action: "move", x: 1, y: 1 }, context);
    __jait_capture(3, (action.ok));
    __jait_capture(4, (f.proxyToolOp.mock.calls), (count));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_105_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tools, proxyToolOp } = setup();
    const started = await tool<{ action: "start"; nodeId: string }>(tools, "computer.session")
      .execute({ action: "start", nodeId: "windows-a" }, context);

    __jait_capture(0, (started.ok));
    const sessionId = (started.data as { session: { id: string } }).session.id;
    __jait_capture(1, (proxyToolOp.mock.calls), ([sessionId]));

    const acted = await tool<Record<string, unknown>>(tools, "computer.act").execute({
      sessionId,
      action: "type",
      text: "hello im jait",
      includeScreenshot: false,
    }, context);
    __jait_capture(2, (acted.ok));
    __jait_capture(3, (proxyToolOp.mock.calls), ([sessionId]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_134_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tools, proxyToolOp } = setup();
    const result = await tool<Record<string, unknown>>(tools, "computer.act").execute({
      sessionId: "missing",
      action: "click",
      x: 10,
    }, context);

    __jait_capture(0, (result));
    __jait_capture(1, (proxyToolOp.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_146_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tools, proxyToolOp } = setup();
    const started = await tool<{ action: "start" }>(tools, "computer.session")
      .execute({ action: "start" }, context);
    const sessionId = (started.data as { session: { id: string } }).session.id;
    proxyToolOp.mockClear();

    const result = await tool<Record<string, unknown>>(tools, "computer.observe").execute(
      { sessionId },
      { ...context, sessionId: "chat-b" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (proxyToolOp.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_163_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tools, proxyToolOp } = setup();
    const sessionTool = tool<Record<string, unknown>>(tools, "computer.session");
    const started = await sessionTool.execute({ action: "start" }, context);
    const sessionId = (started.data as { session: { id: string } }).session.id;
    proxyToolOp.mockRejectedValueOnce(new Error("node disconnected"));

    const stopped = await sessionTool.execute({ action: "stop", sessionId }, context);
    const status = await sessionTool.execute({ action: "status" }, context);

    __jait_capture(0, (stopped));
    __jait_capture(1, (status));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_computer_tools_test_ts_176_3": {


const context: ToolContext = {
  sessionId: "chat-a",
  actionId: "action-a",
  projectRoot: "/workspace",
  requestedBy: "assistant",
};
function windowsNode(overrides: Partial<NodeState> = {}): NodeState {
  return {
    id: "windows-a",
    name: "Windows PC",
    platform: "windows",
    role: "desktop",
    lifecycle: "ready",
    protocolVersion: 1,
    capabilities: {
      providers: [],
      surfaces: ["computer"],
      tools: ["computer.session", "computer.observe", "computer.act"],
      screenShare: true,
      voice: false,
      preview: false,
    },
    connectedAt: new Date(0).toISOString(),
    lastSeenAt: new Date(0).toISOString(),
    ...overrides,
  };
}
function setup(nodes: NodeState[] = [windowsNode()]) {
  const proxyToolOp = vi.fn(async (_nodeId: string, tool: string) => ({
    ok: true,
    message: `${tool} completed`,
    data: { accepted: true },
  }));
  const ws = {
    getNodeRegistry: () => ({
      version: 1,
      serverTime: new Date().toISOString(),
      nodes,
    }),
    proxyToolOp,
  } as unknown as WsControlPlane;
  const sessions = new ComputerControlSessionService();
  const tools = new Map(
    createComputerTools(ws, sessions).map((tool) => [tool.name, tool] as const),
  );
  return { tools, proxyToolOp, sessions, ws };
}
function tool<T>(tools: Map<string, ToolDefinition>, name: string): ToolDefinition<T> {
  const found = tools.get(name);
  if (!found) throw new Error(`Missing tool ${name}`);
  return found as ToolDefinition<T>;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tools, proxyToolOp, sessions } = setup();
    proxyToolOp.mockRejectedValueOnce(new Error("Tool 'computer.session' timed out"));
    const result = await tool<Record<string, unknown>>(tools, "computer.session")
      .execute({ action: "start" }, context);
    __jait_capture(0, (result));
    __jait_capture(1, (proxyToolOp.mock.calls), ([context.sessionId]));
    __jait_capture(2, (sessions.listForOwner(context.sessionId)));
  
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
