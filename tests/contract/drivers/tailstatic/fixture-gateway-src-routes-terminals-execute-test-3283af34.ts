// Translated fixture from packages/gateway/src/routes/terminals-execute.test.ts; expected literals are in tail_static.rs.

import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import type { ControlAccess } from "../../../../packages/gateway/src/security/control-access.js";
import type { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import type { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { registerTerminalRoutes } from "../../../../packages/gateway/src/routes/terminals.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/terminals-execute.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_46_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await executeWithOutput("echo JAIT_TERM_OK", [
      [0, "PS C:\\project> echo JAIT_TERM_OK"],
      [180, `\r\n${osc("C")}JAIT_TERM_OK\r\n${osc("D;0")}${osc("A")}PS C:\\project> ${osc("B")}`],
    ]);
    __jait_capture(1, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_54_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await executeWithOutput("cmd /c exit 7", [
      [0, "PS C:\\project> cmd /c exit 7"],
      [180, `\r\n${osc("C")}${osc("D;7")}${osc("A")}PS C:\\project> ${osc("B")}`],
    ]);
    __jait_capture(1, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_62_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = await executeWithOutput("Write-Output 'PS report > complete'", [
      [0, `PS report > complete\r\n${osc("D;0")}${osc("B")}`],
    ]);
    __jait_capture(1, (result.output));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_72_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = Fastify();
    const config = { ...loadConfig(), jwtSecret: "terminal-list-test-secret" };
    const registry = new ToolRegistry();
    registry.register({ name: "terminal.coverage_fixture", description: "Fixture tool", category: "terminal",
      tier: "standard", source: "builtin", parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "ok" }),
    });
    registerTerminalRoutes(app, {} as SurfaceRegistry, registry, { write: vi.fn() } as unknown as AuditWriter,
      undefined, undefined, { config, access: {} as ControlAccess });
    try {
      const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
      const response = await app.inject({ method: "GET", url: "/api/tools", headers: { authorization: `Bearer ${token}` } });
      __jait_capture(1, (response.statusCode));
      __jait_capture(2, (response.json().tools));
    } finally {
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_95_1_each0": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{
const output = "permission denied";
const exitCode = 126;

try {
await (async()=>{

  const result = await executeWithOutput("run-fixture", [[0, `run-fixture\r\n${output}\r\nPS C:\\project> `]]);
  __jait_capture(1, (result), ({ output, exitCode, timedOut: false }));

})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_95_1_each1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{
const output = "command not found";
const exitCode = 127;

try {
await (async()=>{

  const result = await executeWithOutput("run-fixture", [[0, `run-fixture\r\n${output}\r\nPS C:\\project> `]]);
  __jait_capture(1, (result), ({ output, exitCode, timedOut: false }));

})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_terminals_execute_test_ts_95_1_each2": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const osc = (payload: string) => `\x1b]633;${payload}\x07`;
async function executeWithOutput(command: string, chunks: Array<[number, string]>) {
  const app = Fastify();
  const config = { ...loadConfig(), jwtSecret: "terminal-execution-test-secret" };
  const token = await signAuthToken({ id: "owner", username: "owner" }, config.jwtSecret);
  const listeners = new Set<(data: string) => void>();
  const timers: Array<ReturnType<typeof setTimeout>> = [];
  const surface = {
    id: "windows-terminal", type: "terminal", state: "running",
    snapshot: () => ({ metadata: { shell: "C:\\Program Files\\PowerShell\\7\\pwsh.exe" } }),
    waitForPrompt: async () => {},
    addOutputListener: (listener: (data: string) => void) => listeners.add(listener),
    removeOutputListener: (listener: (data: string) => void) => listeners.delete(listener),
    write: vi.fn(() => {
      for (const [delay, output] of chunks) {
        timers.push(setTimeout(() => { for (const listener of listeners) listener(output); }, delay));
      }
    }),
  };
  registerTerminalRoutes(app, { getSurface: () => surface } as unknown as SurfaceRegistry,
    new ToolRegistry(), { write: vi.fn() } as unknown as AuditWriter, undefined, undefined,
    { config, access: { surface: () => true } as unknown as ControlAccess });
  try {
    const response = await app.inject({ method: "POST", url: "/api/terminals/windows-terminal/execute",
      headers: { authorization: `Bearer ${token}` }, payload: { command, timeout: 2000 } });
    __jait_capture(0, (response.statusCode));
    return response.json();
  } finally {
    for (const timer of timers) clearTimeout(timer);
    await app.close();
  }
}
/*__jait_scope_open__*/{
const output = "completed";
const exitCode = 0;

try {
await (async()=>{

  const result = await executeWithOutput("run-fixture", [[0, `run-fixture\r\n${output}\r\nPS C:\\project> `]]);
  __jait_capture(1, (result), ({ output, exitCode, timedOut: false }));

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
