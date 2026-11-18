// Translated fixture from packages/gateway/src/tools/remote-executor.test.ts; expected literals are in tail_static.rs.
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { FsNode } from "@jait/shared";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import type { ToolContext, ToolResult } from "../../../../packages/gateway/src/tools/contracts.js";
import {
  createRemoteToolExecutor,
  proxyTimeoutMs,
  resolveRemoteNodeForSession,
} from "../../../../packages/gateway/src/tools/remote-executor.js";
import {
  DEFAULT_COMMAND_TIMEOUT_MS,
  MAX_COMMAND_TIMEOUT_MS,
} from "../../../../packages/gateway/src/lib/command-timeout.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/remote-executor.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_67_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
const GRACE_MS = 30_000;
const hourMs = 60 * 60 * 1000;

try {
await (async()=>{

    __jait_capture(0, (proxyTimeoutMs("terminal.run", {})), (DEFAULT_COMMAND_TIMEOUT_MS + GRACE_MS));
    __jait_capture(1, (proxyTimeoutMs("execute", { command: "ls" })), (DEFAULT_COMMAND_TIMEOUT_MS + GRACE_MS));
    __jait_capture(2, (proxyTimeoutMs("jait.terminal", { timeout: hourMs })), (hourMs + GRACE_MS));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_73_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
const GRACE_MS = 30_000;
const hourMs = 60 * 60 * 1000;

try {
await (async()=>{

    __jait_capture(0, (proxyTimeoutMs("terminal.run", { timeout: 0 })), (DEFAULT_COMMAND_TIMEOUT_MS + GRACE_MS));
    __jait_capture(1, (proxyTimeoutMs("terminal.run", { timeout: -1 })), (DEFAULT_COMMAND_TIMEOUT_MS + GRACE_MS));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_78_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
const GRACE_MS = 30_000;
const hourMs = 60 * 60 * 1000;

try {
await (async()=>{

    __jait_capture(0, (proxyTimeoutMs("terminal.run", { timeout: Number.MAX_SAFE_INTEGER })), (MAX_COMMAND_TIMEOUT_MS + GRACE_MS));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_84_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
const GRACE_MS = 30_000;
const hourMs = 60 * 60 * 1000;

try {
await (async()=>{

    __jait_capture(0, (proxyTimeoutMs("terminal.run", { isBackground: true })));
    __jait_capture(1, (proxyTimeoutMs("execute", { isBackground: true, timeout: hourMs })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_89_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
const GRACE_MS = 30_000;
const hourMs = 60 * 60 * 1000;

try {
await (async()=>{

    __jait_capture(0, (proxyTimeoutMs("fs.read", { path: "/x" })));
    __jait_capture(1, (proxyTimeoutMs("jait.terminal.list", { terminalId: "t" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_105_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    cleanupPath = mkdtempSync(join(__jait_fixture_dir, "jait-remote-executor-"));
    const ws = createMockWs();

    __jait_captureType(0, (resolveRemoteNodeForSession(ws, cleanupPath)));
    __jait_capture(1, (ws.getFsNodes.mock.calls));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_113_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs();

    __jait_capture(0, (resolveRemoteNodeForSession(ws, "/definitely/missing/jait/project")), (remoteNode.id));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_119_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs();

    __jait_capture(0, (resolveRemoteNodeForSession(ws, "C:\\Users\\test\\repo")), (windowsNode.id));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_125_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    cleanupPath = mkdtempSync(join(__jait_fixture_dir, "jait-remote-executor-"));
    const ws = createMockWs();

    // Without projectNodeId, existsSync returns true → stays local
    __jait_captureType(0, (resolveRemoteNodeForSession(ws, cleanupPath)));
    // With explicit projectNodeId, uses the remote node even though path exists locally
    __jait_capture(1, (resolveRemoteNodeForSession(ws, cleanupPath, remoteNode.id)), (remoteNode.id));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_135_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs({ findNodeByDeviceId: vi.fn(() => undefined) });

    // Node not found → falls through to existsSync heuristic
    __jait_capture(0, (resolveRemoteNodeForSession(ws, "/definitely/missing/jait/project", "dead-node-id")), (remoteNode.id));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_142_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_3265 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    cleanupPath = mkdtempSync(join(__jait_fixture_dir, "jait-remote-executor-"));
    const ws = createMockWs();

    __jait_captureType(0, (resolveRemoteNodeForSession(ws, cleanupPath, "gateway")));
  
})();

} finally {
await __jait_hook_3265();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_159_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = createToolContext();
    const execOptions = { dryRun: true, consentTimeoutMs: 1000 };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, null);

    await __jait_captureResolved(0, (execute("terminal.run", { command: "pwd" }, context, execOptions)));
    __jait_capture(1, (localExecutor.mock.calls), (["terminal.run",{ command: "pwd" },context,execOptions]));
    __jait_capture(2, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_174_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local memory" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await __jait_captureResolved(0, (execute("memory.search", { query: "release notes" }, context)));
    __jait_capture(1, (localExecutor.mock.calls));
    __jait_capture(2, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_188_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    // Every tool NOT in REMOTE_EXECUTABLE_TOOLS — including newly added ones
    // like the `jait` meta-tool, `web`, `agent`, `todo` — must run on the
    // gateway even when a remote node is bound. This is the core guarantee:
    // a new tool never accidentally gets proxied (and fail) on a node.
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    for (const toolName of ["jait", "web", "agent", "todo", "voice.speak", "some.brand.new.tool"]) {
      await execute(toolName, {}, context);
    }
    __jait_capture(0, (localExecutor.mock.calls));
    __jait_capture(1, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_205_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await execute("file.read", { path: "/remote/project/src/main.ts" }, context);
    __jait_capture(0, (ws.proxyToolOp.mock.calls), ([remoteNode.id,context.sessionId,context.projectRoot]));
    __jait_capture(1, (localExecutor.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_221_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    cleanupPath = mkdtempSync(join(__jait_fixture_dir, "jait-gateway-skill-"));
    const skillPath = join(cleanupPath, "SKILL.md");
    writeFileSync(skillPath, "# Debugging\n");
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local skill" }));
    const context = { ...createToolContext(), projectRoot: "C:\\Users\\test\\repo" };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await __jait_captureResolved(0, (execute("file.read", { path: skillPath }, context)));
    __jait_capture(1, (localExecutor.mock.calls), (["file.read",{ path: skillPath },context,undefined]));
    __jait_capture(2, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_238_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const onOutputChunk = vi.fn();
    const ws = createMockWs();
    const localExecutor = vi.fn(async () => ({ ok: true, message: "local result" }));
    const context = { ...createToolContext(), onOutputChunk };
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await __jait_captureResolved(0, (execute("terminal.run", { command: "pwd" }, context)));
    __jait_capture(1, (localExecutor.mock.calls), (["terminal.run",{ command: "pwd" },{ ...context, executionNodeId: remoteNode.id },undefined]));
    __jait_capture(2, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_258_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const ws = createMockWs({ findNodeByDeviceId: vi.fn(() => undefined) });
    const localExecutor = vi.fn(async () => ({ ok: true, message: "fallback result" }));
    const context = createToolContext();
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await __jait_captureResolved(0, (execute("terminal.run", { command: "pwd" }, context)), ({
      ok: false,
      message: `Project node ${remoteNode.id} is disconnected; terminal command was not run`,
    }));
    __jait_capture(1, (localExecutor.mock.calls));
    __jait_capture(2, (ws.proxyToolOp.mock.calls));
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_remote_executor_test_ts_272_3": {


const remoteNode: FsNode = {
  id: "node-linux",
  name: "Linux Desktop",
  platform: "linux",
  clientId: "client-linux",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const windowsNode: FsNode = {
  id: "node-windows",
  name: "Windows Desktop",
  platform: "windows",
  clientId: "client-windows",
  isGateway: false,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
const gatewayNode: FsNode = {
  id: "gateway",
  name: "Gateway",
  platform: "linux",
  clientId: "gateway-client",
  isGateway: true,
  registeredAt: "2026-01-01T00:00:00.000Z",
};
function createToolContext(): ToolContext {
  return {
    sessionId: "session-1",
    actionId: "action-1",
    projectRoot: "/remote/project",
    requestedBy: "test-user",
  };
}
function createMockWs(overrides: Partial<WsControlPlane> = {}) {
  return {
    getFsNodes: vi.fn(() => [gatewayNode, remoteNode, windowsNode]),
    findNodeByDeviceId: vi.fn((nodeId: string) => (nodeId === remoteNode.id ? remoteNode : undefined)),
    proxyToolOp: vi.fn(async () => ({ ok: true, message: "remote result" })),
    ...overrides,
  } as unknown as WsControlPlane;
}
/*__jait_scope_open__*/{
let cleanupPath: string | null = null;
const __jait_hook_5316 = () => {
    if (cleanupPath) {
      rmSync(cleanupPath, { force: true, recursive: true });
      cleanupPath = null;
    }
  };

try {
await (async()=>{

    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const ws = createMockWs({
      proxyToolOp: vi.fn(async () => {
        throw new Error("network timeout");
      }),
    });
    const localExecutor = vi.fn(async (): Promise<ToolResult> => ({ ok: true, message: "local result" }));
    const execute = createRemoteToolExecutor({ ws, localExecutor }, remoteNode.id);

    await __jait_captureResolved(0, (execute("file.write", { path: "/remote/project/out.txt", content: "ok" }, createToolContext())));
    __jait_capture(1, (localExecutor.mock.calls));
    __jait_capture(2, (errorSpy.mock.calls));

    errorSpy.mockRestore();
  
})();

} finally {
await __jait_hook_5316();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
