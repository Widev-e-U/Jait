// Translated fixture from packages/gateway/src/tools/os-control-tools.test.ts; expected literals are in tail_static.rs.
import type { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import {
  buildXdotoolKeys,
  LinuxDesktopOsControlDriver,
} from "../../../../packages/gateway/src/os-control/linux-desktop-driver.js";
import {
  buildWindowsSendKeys,
  buildWindowsSshArgs,
  encodePowerShellCommand,
  escapeSendKeysText,
  extractSshPort,
} from "../../../../packages/gateway/src/os-control/windows-driver.js";
import type { OsControlDriver, OsScreenshot } from "../../../../packages/gateway/src/os-control/types.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createOsControlToolset } from "../../../../packages/gateway/src/tools/os-control-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/os-control-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_101_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.screenshot();
    __jait_capture(0, (calls));
    __jait_capture(1, (calls[0].containerName));
    __jait_capture(2, (calls[0].command));
    __jait_capture(3, (calls[0].command));
    __jait_capture(4, (calls[0].timeoutMs));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_112_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.click(120, 340, { button: "right", clicks: 2 });
    __jait_capture(0, (calls[0].command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_119_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.mouseMove(5.9, 20.1);
    __jait_capture(0, (calls[0].command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_126_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.type('hello "world"\n$HOME', { delayMs: 30 });
    __jait_capture(0, (calls[0].command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_133_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.key("ctrl+shift+t");
    __jait_capture(0, (calls[0].command));

    calls.length = 0;
    await driver.key("super+d", { holdMs: 250 });
    __jait_capture(1, (calls[0].command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_146_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.scroll();
    __jait_capture(0, (calls[0].command));

    calls.length = 0;
    await driver.scroll({ direction: "up", amount: 2 });
    __jait_capture(1, (calls[0].command));

    calls.length = 0;
    await driver.scroll({ x: 10, y: 20, direction: "down" });
    __jait_capture(2, (calls[0].command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_161_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { manager, calls } = fakeShellManager();
    const driver = new LinuxDesktopOsControlDriver(manager, "os-linux-test");
    await driver.exec("echo hi", { cwd: "/root", timeoutMs: 5000 });
    __jait_capture(0, (calls));
    __jait_capture(1, (calls[0].command));
    __jait_capture(2, (calls[0].timeoutMs));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_170_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildXdotoolKeys("ctrl+shift+t")));
    __jait_capture(1, (buildXdotoolKeys("super+d")));
    __jait_capture(2, (buildXdotoolKeys("alt+tab")));
    __jait_capture(3, (buildXdotoolKeys("ctrl+alt+delete")));
    __jait_capture(4, (buildXdotoolKeys("ctrl+space")));
    __jait_capture(5, (buildXdotoolKeys("enter")));
    __jait_capture(6, (buildXdotoolKeys("  ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_181_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ports = JSON.stringify({
      "22/tcp": [{ HostIp: "0.0.0.0", HostPort: "2222" }],
      "3389/tcp": [{ HostIp: "0.0.0.0", HostPort: "3389" }],
      "8006/tcp": [{ HostIp: "0.0.0.0", HostPort: "8006" }],
    });
    __jait_capture(0, (extractSshPort(ports)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_190_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ports = JSON.stringify({
      "2222/tcp": [{ HostIp: "0.0.0.0", HostPort: "42222" }],
    });
    __jait_capture(0, (extractSshPort(ports)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_197_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ports = JSON.stringify({
      "3389/tcp": [{ HostIp: "0.0.0.0", HostPort: "3389" }],
    });
    __jait_captureType(0, (extractSshPort(ports)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_204_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildWindowsSendKeys("ctrl+shift+t")));
    __jait_capture(1, (buildWindowsSendKeys("alt+tab")));
    __jait_capture(2, (buildWindowsSendKeys("super+d")));
    __jait_capture(3, (buildWindowsSendKeys("ctrl+alt+delete")));
    __jait_capture(4, (buildWindowsSendKeys("enter")));
    __jait_capture(5, (buildWindowsSendKeys("  ")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_213_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (escapeSendKeysText("a+b^c%d~e(f)g{h}i[j]")));
    __jait_capture(1, (escapeSendKeysText("plain text")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_218_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const snippet = "Write-Output 'hi'";
    const encoded = encodePowerShellCommand(snippet);
    // Decoding the base64 as UTF-16LE must round-trip to the original snippet.
    __jait_capture(0, (Buffer.from(encoded, "base64").toString("utf16le")), (snippet));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_225_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const args = buildWindowsSshArgs({
      port: 42222,
      username: "Docker",
      command: "powershell -NoProfile -EncodedCommand abc",
    });
    __jait_capture(0, (args));
    __jait_capture(1, (args));
    __jait_capture(2, (args));
    __jait_capture(3, (args));
    __jait_capture(4, (args));
    __jait_capture(5, (args[args.length - 1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_256_3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }

try {
await (async()=>{

    const { tools } = makeToolset();
    for (const name of [
      "os.screenshot",
      "os.click",
      "os.mouse",
      "os.type",
      "os.keyboard",
      "os.scroll",
      "os.exec",
      "os.sandbox.list",
    ]) {
      __jait_capture(0, (tools.has(name)));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_273_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as {
        ok: boolean;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      const shot = r.data!.screenshot as { pngBase64: string; width: number; height: number };
      __jait_capture(1, (shot.pngBase64), (FAKE_PNG.toString("base64")));
      __jait_capture(2, (shot.width));
      __jait_capture(3, (shot.height));
      __jait_capture(4, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_287_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error('OS sandbox "os-linux-test" is not running.'),
      });
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_296_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubs.screenshot.mockRejectedValue(new Error("import: no X server"));
      const r = (await tools.get("os.screenshot")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_307_5_each0": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.click";
const verb = "Click";
const input = { x: 10, y: 20, button: "left" };

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message), (`${verb} applied on sandbox`));
      __jait_captureType(2, (r.data!.screenshot));
      __jait_capture(3, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_307_5_each1": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.mouse";
const verb = "Mouse move";
const input = { x: 10, y: 20 };

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message), (`${verb} applied on sandbox`));
      __jait_captureType(2, (r.data!.screenshot));
      __jait_capture(3, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_307_5_each2": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.type";
const verb = "Type";
const input = { text: "hi" };

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message), (`${verb} applied on sandbox`));
      __jait_captureType(2, (r.data!.screenshot));
      __jait_capture(3, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_307_5_each3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.keyboard";
const verb = "Keyboard";
const input = { combo: "ctrl+c" };

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message), (`${verb} applied on sandbox`));
      __jait_captureType(2, (r.data!.screenshot));
      __jait_capture(3, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_307_5_each4": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.scroll";
const verb = "Scroll";
const input = { direction: "down" };

try {
await (async()=>{

      const { driver, tools } = makeToolset();
      const r = (await tools.get(name)!.execute(input, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message), (`${verb} applied on sandbox`));
      __jait_captureType(2, (r.data!.screenshot));
      __jait_capture(3, (driver.screenshot.mock.calls));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_326_5_each0": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.click";

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_326_5_each1": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.mouse";

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_326_5_each2": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.type";

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_326_5_each3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.keyboard";

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_326_5_each4": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.scroll";

try {
await (async()=>{

      const { tools } = makeToolset({
        resolveError: new Error("No running OS sandbox found."),
      });
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_341_5_each0": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.click";
const stubOf = (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.click;

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_341_5_each1": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.mouse";
const stubOf = (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.mouseMove;

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_341_5_each2": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.type";
const stubOf = (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.type;

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_341_5_each3": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.keyboard";
const stubOf = (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.key;

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_341_5_each4": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = "os.scroll";
const stubOf = (s: ReturnType<typeof makeMockDriver>["stubs"]) => s.scroll;

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubOf(stubs).mockRejectedValue(new Error("xdotool failed"));
      const r = (await tools.get(name)!.execute({ x: 1, y: 2 }, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_358_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubs.exec.mockResolvedValue({
        ok: true,
        output: "hello",
        exitCode: 0,
        timedOut: false,
        containerName: "os-linux-test",
      });
      const r = (await tools.get("os.exec")!.execute({ command: "echo hello" }, toolCtx)) as {
        ok: boolean;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.data!.output));
      __jait_capture(2, (r.data!.exitCode));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_376_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubs.exec.mockResolvedValue({
        ok: false,
        output: "boom",
        exitCode: 2,
        timedOut: false,
        containerName: "os-linux-test",
      });
      const r = (await tools.get("os.exec")!.execute({ command: "false" }, toolCtx)) as {
        ok: boolean;
        message?: string;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_393_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { stubs, tools } = makeToolset();
      stubs.exec.mockRejectedValue(new Error("docker exec failed"));
      const r = (await tools.get("os.exec")!.execute({ command: "ls" }, toolCtx)) as {
        ok: boolean;
        message?: string;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
      __jait_capture(2, (r.message));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_407_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const sandboxes = [
        { containerName: "os-linux-abc", type: "linux-desktop", running: true },
        { containerName: "os-windows-def", type: "windows", running: true },
      ];
      const { tools } = makeToolset({ sandboxes });
      const r = (await tools.get("os.sandbox.list")!.execute({}, toolCtx)) as {
        ok: boolean;
        message?: string;
        data?: Record<string, unknown>;
      };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.data!.sandboxes), (sandboxes));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_os_control_tools_test_ts_422_5": {


const toolCtx = {} as unknown as ToolContext;
const FAKE_PNG = Buffer.from(
  "89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489" +
    "0000000d49444154789c6360000002000154a14c8d0000000049454e44ae426082",
  "hex",
);
function fakeShot(width = 1280, height = 720): OsScreenshot {
  return { png: FAKE_PNG, width, height };
}
function fakeShellManager() {
  const calls: Array<{ containerName: string; command: string; timeoutMs?: number }> = [];
  const manager = {
    execShell: vi.fn(async (o: { containerName: string; command: string; timeoutMs?: number }) => {
      calls.push({ ...o });
      return { ok: true, output: "ok", exitCode: 0, timedOut: false, containerName: o.containerName };
    }),
  } as unknown as SandboxManager;
  return { manager, calls };
}
function makeMockDriver() {
  const stubs = {
    screenshot: vi.fn(async () => fakeShot()),
    click: vi.fn(async () => {}),
    mouseMove: vi.fn(async () => {}),
    type: vi.fn(async () => {}),
    key: vi.fn(async () => {}),
    scroll: vi.fn(async () => {}),
    exec: vi.fn(async () => ({
      ok: true,
      output: "ok",
      exitCode: 0,
      timedOut: false,
      containerName: "os-linux-test",
    })),
  };
  const driver = {
    osType: "linux-desktop",
    ...stubs,
  } as unknown as OsControlDriver;
  return { driver, stubs };
}
interface Binding {
  driver: OsControlDriver;
  containerName: string;
  type: "linux-desktop" | "windows";
}
function makeResolver(
  driver: OsControlDriver,
  { resolveError, list }: { resolveError?: Error; list?: Binding[] } = {},
) {
  return {
    resolve: vi.fn(async () => {
      if (resolveError) throw resolveError;
      return { driver, containerName: "os-linux-test", type: "linux-desktop" as const };
    }),
    listSandboxes: vi.fn(async () => list ?? []),
  };
}
function byName<T extends { name: string }>(tools: T[]) {
  return new Map(tools.map((t) => [t.name, t]));
}
/*__jait_scope_open__*/{
function makeToolset(opts?: {
    resolveError?: Error;
    list?: Binding[];
    sandboxes?: unknown[];
  }) {
    const { driver, stubs } = makeMockDriver();
    const resolver = makeResolver(driver, {
      resolveError: opts?.resolveError,
      list: (opts?.sandboxes ?? []) as Binding[],
    });
    return { driver, stubs, resolver, tools: byName(createOsControlToolset(resolver)) };
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      const { resolver, tools } = makeToolset();
      resolver.listSandboxes.mockRejectedValue(new Error("docker ps failed"));
      const r = (await tools.get("os.sandbox.list")!.execute({}, toolCtx)) as { ok: boolean; message?: string };
      __jait_capture(0, (r.ok));
      __jait_capture(1, (r.message));
    
})();

} finally {

}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
