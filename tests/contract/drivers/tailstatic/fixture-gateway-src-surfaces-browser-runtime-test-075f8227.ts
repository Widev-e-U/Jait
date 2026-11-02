// Translated fixture from packages/gateway/src/surfaces/browser-runtime.test.ts; expected literals are in tail_static.rs.
import {
  BrowserSurface,
  createConsoleFloodGuard,
  pushBrowserRuntimeEvent,
  type BrowserDriver,
  type BrowserRuntimeEvent,
  resolveBrowserRuntimeMode,
  selectInitialBrowserPage,
  selectVisibleBrowserPage,
} from "../../../../packages/gateway/src/surfaces/browser.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/surfaces/browser-runtime.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_55_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
const __jait_hook_1091 = () => {
    vi.useRealTimers();
    setPlatform(originalPlatform);
    setBunVersion(originalBunVersion);
    if (originalBrowserRuntime === undefined) {
      delete process.env.BROWSER_RUNTIME;
    } else {
      process.env.BROWSER_RUNTIME = originalBrowserRuntime;
    }
  };

try {
await (async()=>{

    setBrowserRuntimeEnv("");
    setPlatform("win32");
    setBunVersion("1.2.0");

    __jait_capture(0, (resolveBrowserRuntimeMode()));
  
})();

} finally {
await __jait_hook_1091();
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_63_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
const __jait_hook_1091 = () => {
    vi.useRealTimers();
    setPlatform(originalPlatform);
    setBunVersion(originalBunVersion);
    if (originalBrowserRuntime === undefined) {
      delete process.env.BROWSER_RUNTIME;
    } else {
      process.env.BROWSER_RUNTIME = originalBrowserRuntime;
    }
  };

try {
await (async()=>{

    setBrowserRuntimeEnv("node-bridge");
    setPlatform("win32");
    setBunVersion("1.2.0");

    __jait_capture(0, (resolveBrowserRuntimeMode()));
  
})();

} finally {
await __jait_hook_1091();
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_71_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
const __jait_hook_1091 = () => {
    vi.useRealTimers();
    setPlatform(originalPlatform);
    setBunVersion(originalBunVersion);
    if (originalBrowserRuntime === undefined) {
      delete process.env.BROWSER_RUNTIME;
    } else {
      process.env.BROWSER_RUNTIME = originalBrowserRuntime;
    }
  };

try {
await (async()=>{

    setBrowserRuntimeEnv("in-process");
    setPlatform("win32");
    setBunVersion("1.2.0");

    __jait_capture(0, (resolveBrowserRuntimeMode()));
  
})();

} finally {
await __jait_hook_1091();
}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_81_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const now = vi.spyOn(Date, "now").mockReturnValue(0);
    const close = vi.fn().mockResolvedValue(undefined);
    const driver: BrowserDriver = {
      navigate: vi.fn().mockResolvedValue(undefined),
      click: vi.fn().mockResolvedValue(undefined),
      typeText: vi.fn().mockResolvedValue(undefined),
      scroll: vi.fn().mockResolvedValue(undefined),
      select: vi.fn().mockResolvedValue(undefined),
      waitFor: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue("/tmp/screen.png"),
      snapshot: vi.fn().mockResolvedValue({
        url: "about:blank",
        title: "Blank",
        text: "",
        elements: [],
        activeElement: null,
        dialogs: [],
        obstruction: null,
      }),
      diagnose: vi.fn().mockResolvedValue({ selector: "#target", found: false }),
      getMetrics: vi.fn().mockResolvedValue({ sampledAt: new Date().toISOString() }),
      getEvents: vi.fn().mockReturnValue([]),
      close,
      liveView: {
        display: "container:jait-browser-sb-test",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
        containerName: "jait-browser-sb-test",
      },
    };
    const surface = new BrowserSurface("browser-test", {
      driverFactory: async () => driver,
    });

    await surface.start({ sessionId: "session-1", projectRoot: "/project" });
    now.mockReturnValue(5 * 60 * 1000);

    __jait_capture(0, (surface.idleMs), (5 * 60 * 1000));
    __jait_capture(1, (surface.snapshot().metadata.liveViewContainerName));

    await surface.describe();
    __jait_capture(2, (surface.idleMs));

    await surface.stop();
    __jait_capture(3, (close.mock.calls));
    now.mockRestore();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_133_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let connected = true;
    const driver = { isConnected: () => connected, close: async () => {} } as BrowserDriver;
    const surface = new BrowserSurface("ended-browser", { driverFactory: async () => driver });
    await surface.start({ sessionId: "owned-chat", projectRoot: "/project" });
    __jait_capture(0, (surface.state));
    connected = false;
    __jait_capture(1, (surface.state));
    __jait_capture(2, (surface.snapshot().state));
    await surface.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_151_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    const guard = createConsoleFloodGuard();
    const events: BrowserRuntimeEvent[] = [];

    // Defaults: 60s window, 200 events, 30s cooldown, real clock.
    pushConsole(events, guard, "first");

    __jait_capture(0, (events));
    __jait_capture(1, (events[0].text));
    __jait_capture(2, (guard.isPaused()));
    __jait_capture(3, (guard.state()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_164_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    let now = 0;
    const guard = createConsoleFloodGuard({ windowMs: 1000, threshold: 4, cooldownMs: 5000, now: () => now });
    const events: BrowserRuntimeEvent[] = [];

    pushConsole(events, guard, "a");
    pushConsole(events, guard, "b");
    pushConsole(events, guard, "c");

    __jait_capture(0, (events.map((e) => e.text)));
    __jait_capture(1, (guard.state(now).paused));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_177_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    let now = 0;
    const guard = createConsoleFloodGuard({ windowMs: 1000, threshold: 4, cooldownMs: 5000, now: () => now });
    const events: BrowserRuntimeEvent[] = [];

    for (let i = 1; i <= 4; i++) pushConsole(events, guard, `msg-${i}`);

    // 4th event within the window triggers the pause: it is dropped and
    // replaced by a warn notice.
    __jait_capture(0, (guard.state(now).paused));
    __jait_capture(1, (events.length));
    __jait_capture(2, (events[3]));
    __jait_capture(3, (events[3].text));
    __jait_capture(4, (events[3].text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_196_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    let now = 0;
    const guard = createConsoleFloodGuard({ windowMs: 1000, threshold: 4, cooldownMs: 5000, now: () => now });
    const events: BrowserRuntimeEvent[] = [];

    for (let i = 1; i <= 4; i++) pushConsole(events, guard, `msg-${i}`);
    const pausedAt = events.length;

    pushConsole(events, guard, "spam-1");
    pushConsole(events, guard, "spam-2");
    __jait_capture(0, (events.length), (pausedAt)); // dropped

    // Non-console events are unaffected while console capture is paused.
    pushBrowserRuntimeEvent(events, { type: "pageerror", level: "error", text: "boom" }, guard);
    pushBrowserRuntimeEvent(events, { type: "response", level: "warn", text: "HTTP 500", status: 500, url: "/x", method: "GET" }, guard);
    __jait_capture(1, (events.length), (pausedAt + 2));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_214_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    let now = 0;
    const guard = createConsoleFloodGuard({ windowMs: 1000, threshold: 4, cooldownMs: 5000, now: () => now });
    const events: BrowserRuntimeEvent[] = [];

    for (let i = 1; i <= 4; i++) pushConsole(events, guard, `msg-${i}`);
    __jait_capture(0, (guard.state(now).paused));

    now += 5000; // cooldown expires
    __jait_capture(1, (guard.state(now).paused));

    pushConsole(events, guard, "after-pause");
    __jait_capture(2, (events[events.length - 2].text));
    __jait_capture(3, (events[events.length - 1].text));
    __jait_capture(4, (guard.state(now).paused));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_231_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{
function pushConsole(events: BrowserRuntimeEvent[], guard: ReturnType<typeof createConsoleFloodGuard>, text: string, level = "log"): void {
    pushBrowserRuntimeEvent(events, { type: "console", level, text }, guard);
  }

try {
await (async()=>{

    let now = 0;
    const guard = createConsoleFloodGuard({ windowMs: 1000, threshold: 4, cooldownMs: 5000, now: () => now });
    const events: BrowserRuntimeEvent[] = [];

    pushConsole(events, guard, "a");
    now += 600;
    pushConsole(events, guard, "b");
    now += 600; // 'a' now falls out of the 1000ms window
    pushConsole(events, guard, "c");
    pushConsole(events, guard, "d");

    __jait_capture(0, (guard.state(now).paused));
    __jait_capture(1, (events.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_249_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const blankPage = { url: () => "about:blank" };
    const appPage = { url: () => "http://127.0.0.1:8000/" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await __jait_captureResolved(0, (selectInitialBrowserPage({
      pages: () => [blankPage, appPage],
      newPage,
    })), (blankPage));

    __jait_capture(1, (newPage.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_262_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const newTabPage = { url: () => "chrome://new-tab-page/" };
    const appPage = { url: () => "http://127.0.0.1:8000/" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await __jait_captureResolved(0, (selectInitialBrowserPage({
      pages: () => [newTabPage, appPage],
      newPage,
    })), (newTabPage));

    __jait_capture(1, (newPage.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_275_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const createdPage = { url: () => "about:blank" };
    const newPage = vi.fn().mockResolvedValue(createdPage);

    await __jait_captureResolved(0, (selectInitialBrowserPage({
      pages: () => [{ url: () => "http://127.0.0.1:8000/" }],
      newPage,
    })), (createdPage));

    __jait_capture(1, (newPage.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_287_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const closedBlankPage = { isClosed: () => true, url: () => "about:blank" };
    const openBlankPage = { isClosed: () => false, url: () => "about:blank" };
    const newPage = vi.fn().mockResolvedValue({ url: () => "about:blank" });

    await __jait_captureResolved(0, (selectInitialBrowserPage({
      pages: () => [closedBlankPage, openBlankPage],
      newPage,
    })), (openBlankPage));

    __jait_capture(1, (newPage.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_surfaces_browser_runtime_test_ts_303_3": {


const originalPlatform = process.platform;
const originalBunVersion = process.versions.bun;
const originalBrowserRuntime = process.env.BROWSER_RUNTIME;
function setPlatform(value: NodeJS.Platform): void {
  Object.defineProperty(process, "platform", {
    value,
    configurable: true,
  });
}
function setBunVersion(value: string | undefined): void {
  if (value === undefined) {
    delete (process.versions as NodeJS.ProcessVersions & { bun?: string }).bun;
    return;
  }
  Object.defineProperty(process.versions, "bun", {
    value,
    configurable: true,
  });
}
function setBrowserRuntimeEnv(value: string): void {
  if (value) {
    process.env.BROWSER_RUNTIME = value;
    return;
  }
  delete process.env.BROWSER_RUNTIME;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const original = { isClosed: () => false, evaluate: vi.fn().mockResolvedValue({ visible: false, focused: false }) };
    const popup = { isClosed: () => false, evaluate: vi.fn().mockResolvedValue({ visible: true, focused: true }) };
    __jait_capture(0, (await selectVisibleBrowserPage([original, popup], original)), (popup));
    const { createRequire } = await import("node:module");
    const bridge = createRequire(__jait_original_url)("./playwright-node-bridge.cjs");
    __jait_capture(1, (await bridge.selectVisiblePage([original, popup], original)), (popup));
    original.evaluate.mockResolvedValue({ visible: true, focused: true });
    __jait_capture(2, (await selectVisibleBrowserPage([original, popup], popup)), (popup));
    __jait_capture(3, (await bridge.selectVisiblePage([original, popup], popup)), (popup));
    popup.evaluate.mockRejectedValue(new Error("Tab closed"));
    __jait_capture(4, (await selectVisibleBrowserPage([original, popup], original)), (original));
    __jait_capture(5, (await bridge.selectVisiblePage([original, popup], original)), (original));
  
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
