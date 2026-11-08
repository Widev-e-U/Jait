// Translated fixture from packages/gateway/src/services/preview.test.ts; expected literals are in tail_static.rs.
import { mkdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { PreviewService } from "../../../../packages/gateway/src/services/preview.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/preview.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_preview_test_ts_9_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      getDevToolsConnection: vi.fn().mockResolvedValue({ endpoint: "http://127.0.0.1:9222", targetId: "page-1" }),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), stopSurface: vi.fn().mockResolvedValue(undefined) };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    const grant = await service.getDevToolsConnection("owner");
    __jait_captureType(0, (grant));
    service.setSharedWithAgent("owner", true);
    __jait_capture(1, (service.isDevToolsConnectionActive("owner", "browser-1", grant!.revision)));
    service.setSharedWithAgent("owner", false);
    __jait_capture(2, (service.isDevToolsConnectionActive("owner", "browser-1", grant!.revision)));
    const second = await service.getDevToolsConnection("owner");
    await service.stop("owner");
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    __jait_capture(3, (service.isDevToolsConnectionActive("owner", "browser-1", second!.revision)));
    let resolveConnection!: (value: { endpoint: string; targetId: string }) => void;
    browser.getDevToolsConnection.mockImplementationOnce(() => new Promise(resolve => { resolveConnection = resolve; }));
    const pending = service.getDevToolsConnection("owner");
    service.setSharedWithAgent("owner", true);
    service.setSharedWithAgent("owner", false);
    resolveConnection({ endpoint: "http://127.0.0.1:9222", targetId: "page-1" });
    __jait_captureType(4, (await pending));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_37_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      reload: vi.fn().mockResolvedValue({ url: "https://example.com/#details" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    __jait_captureType(0, (await service.reload("missing")));
    const result = await service.reload("owner");
    __jait_capture(1, (browser.reload.mock.calls));
    __jait_capture(2, (result?.browserId));
    __jait_capture(3, (result?.sharedWithAgent));
    __jait_capture(4, (registry.startSurface.mock.calls));
    service.setSharedWithAgent("owner", true);
    const sharedResult = await service.reload("owner");
    __jait_capture(5, (sharedResult?.sharedWithAgent));
    __jait_capture(6, (sharedResult?.browserId));
    __jait_capture(7, (browser.reload.mock.calls));
    __jait_thrown(8, () => service.assertAgentControl("browser-1"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_61_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      history: vi.fn().mockResolvedValue({ url: "https://example.com/previous" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    __jait_captureType(0, (await service.history("missing", "back")));
    __jait_capture(1, (await service.history("owner", "back")));
    __jait_capture(2, (browser.history.mock.calls));
    service.setSharedWithAgent("owner", true);
    __jait_capture(3, (await service.history("owner", "forward")));
    __jait_capture(4, (browser.history.mock.calls));
    registry.getSurface.mockReturnValueOnce(null as any);
    __jait_captureType(5, (await service.history("owner", "back")));
    __jait_capture(6, (registry.startSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_82_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      id: "browser-1", sessionId: "owner", type: "browser", state: "running",
      navigate: vi.fn().mockResolvedValue({ url: "https://example.com/redirected" }),
      getEvents: vi.fn().mockReturnValue([]), getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
    };
    const registry = { getSurface: vi.fn().mockReturnValue(browser), startSurface: vi.fn() };
    const service = new PreviewService(registry as any);
    service.attachAgentBrowser("owner", browser as any, undefined, false);
    await __jait_rejected(0, service.navigate("owner", "file:///etc/passwd"));
    await __jait_rejected(1, service.navigate("owner", "javascript:alert(1)"));
    await __jait_rejected(2, service.navigate("owner", "https://user:password@example.com/"));
    __jait_capture(3, (browser.navigate.mock.calls));
    __jait_captureType(4, (await service.navigate("missing", "https://example.com/")));
    const result = await service.navigate("owner", "https://example.com/");
    __jait_capture(5, (browser.navigate.mock.calls));
    __jait_capture(6, (result?.browserId));
    __jait_capture(7, (result?.sharedWithAgent));
    __jait_capture(8, (registry.startSurface.mock.calls));
    service.setSharedWithAgent("owner", true);
    const sharedResult = await service.navigate("owner", "https://example.com/");
    __jait_capture(9, (sharedResult?.sharedWithAgent));
    __jait_capture(10, (sharedResult?.browserId));
    __jait_thrown(11, () => service.assertAgentControl("browser-1"));
    await __jait_rejected(12, service.navigate("owner", "file:///etc/passwd"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_110_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockRejectedValue(new Error("browser unavailable")),
      getSurface: vi.fn().mockReturnValue(null),
    };
    const service = new PreviewService(registry as any);
    const runnerResult = {
      process: null, port: 4173, command: "npm run dev", url: "http://127.0.0.1:4173/",
      mode: "local" as const,
    };
    const runnerStop = vi.fn().mockResolvedValue(undefined);
    (service as any).runner = {
      mode: "local",
      start: vi.fn().mockResolvedValue(runnerResult),
      stop: runnerStop,
    };
    const result = await service.start({ sessionId: "broken-browser", projectRoot: "/project/app" });
    __jait_capture(0, (result.status));
    __jait_capture(1, (result.lastError));
    __jait_capture(2, (runnerStop.mock.calls), ([runnerResult]));
    __jait_capture(3, (registry.stopSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_134_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      type: "browser", state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(registry as any);
    const first = await service.start({ sessionId: "same-session", target: "4173" });
    const second = await service.start({ sessionId: "same-session", target: "4173" });
    __jait_capture(0, (second.createdAt), (first.createdAt));
    __jait_capture(1, (registry.startSurface.mock.calls));
    await service.restart("same-session");
    __jait_capture(2, (registry.startSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_156_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const registry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(registry as any);
    const started = await service.start({ sessionId: "sharing-session", target: "4173" });
    __jait_capture(0, (started.sharedWithAgent));
    __jait_thrown(1, () => service.assertAgentControl(started.browserId!));
    service.setSharedWithAgent("sharing-session", false);
    __jait_thrown(2, () => service.assertAgentControl(started.browserId!));

    const shared = service.setSharedWithAgent("sharing-session", true);
    __jait_capture(3, (shared?.sharedWithAgent));
    __jait_capture(4, (service.getSessionByPreviewSessionId("sharing-session")?.browserId), (started.browserId));
    __jait_thrown(5, () => service.assertAgentControl(started.browserId!));

    const restarted = await service.restart("sharing-session");
    __jait_capture(6, (restarted?.sharedWithAgent));
    const reloaded = await service.start({ sessionId: "sharing-session", target: "4174" });
    __jait_capture(7, (reloaded.sharedWithAgent));
    service.setSharedWithAgent("sharing-session", false);
    __jait_thrown(8, () => service.assertAgentControl(started.browserId!));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_190_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    let finishStart!: (browser: unknown) => void;
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getMetrics: vi.fn().mockResolvedValue(null),
      getLiveViewInfo: vi.fn().mockReturnValue({ vncPort: 5900, websockifyPort: 6080, novncUrl: "ws://127.0.0.1:6080" }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockImplementation(() => new Promise((resolve) => { finishStart = resolve; })),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    const starting = service.start({ sessionId: "closing-session", target: "4173" });
    await vi.waitFor(() => __jait_capture(0, (surfaceRegistry.startSurface.mock.calls)));
    __jait_capture(1, (await service.stop("closing-session")));
    finishStart(browser);
    const result = await starting;
    __jait_capture(2, (result.status));
    __jait_captureType(3, (service.get("closing-session")));
    __jait_capture(4, (surfaceRegistry.stopSurface.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_216_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    const runnerStart = vi.fn();
    (service as any).runner = {
      mode: "local",
      start: runnerStart,
      stop: vi.fn(),
    };

    const session = await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    __jait_capture(0, (runnerStart.mock.calls));
    __jait_capture(1, (session.mode));
    __jait_capture(2, (session.status));
    __jait_capture(3, (session.url));
    __jait_capture(4, (session.remoteBrowser));
    __jait_capture(5, (surfaceRegistry.startSurface.mock.calls));
    __jait_capture(6, (browser.navigate.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_269_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://172.17.0.1:4174/",
        title: "Preview App",
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    const runnerStart = vi.fn();
    (service as any).runner = {
      mode: "local",
      start: runnerStart,
      stop: vi.fn(),
    };

    const session = await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "http://172.17.0.1:4174/",
    });

    __jait_capture(0, (runnerStart.mock.calls));
    __jait_capture(1, (session.mode));
    __jait_capture(2, (session.status));
    __jait_capture(3, (browser.navigate.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_312_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `preview-${Date.now()}.png`);
    await writeFile(screenshotPath, Buffer.from("preview-image"));
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([{ id: 1, timestamp: "2026-03-27T00:00:00.000Z", type: "console", text: "ready" }]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:01.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
        webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
      }),
      screenshot: vi.fn().mockResolvedValue(screenshotPath),
      inspect: vi.fn().mockResolvedValue({
        snapshot: {
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          text: "Dashboard loaded",
          elements: [{ role: "button", name: "Save", selector: "button" }],
          activeElement: { role: "textbox", name: "Search", selector: "input[name=\"q\"]" },
          dialogs: [{ role: "dialog", title: "Settings" }],
          obstruction: {
            hasModal: true,
            dialogCount: 1,
            activeDialogTitle: "Settings",
            topLayer: [],
            notes: ["1 dialog visible."],
          },
        },
        metrics: {
          sampledAt: "2026-03-27T00:00:01.000Z",
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
        },
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1");
    __jait_captureType(0, (inspection));
    __jait_capture(1, (inspection), ({
      status: "ready",
      url: "/noVNC/vnc_lite.html?path=api/live-view/6080/websockify",
      screenshot: Buffer.from("preview-image").toString("base64"),
      page: {
        title: "Preview App",
        activeElement: { name: "Search" },
        dialogs: [{ title: "Settings" }],
        obstruction: { hasModal: true },
      },
      metrics: {
        title: "Preview App",
        webVitals: { lcpMs: 180, cls: 0.01, inpMs: 40 },
      },
    }));
    __jait_capture(2, (inspection?.snapshot));
    __jait_capture(3, (inspection?.snapshot));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_397_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    await mkdir(screenshotDir, { recursive: true });
    const screenshotPath = join(screenshotDir, `preview-${Date.now()}-selector.png`);
    await writeFile(screenshotPath, Buffer.from("selector-preview-image"));
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
      screenshot: vi.fn().mockResolvedValue(screenshotPath),
      inspect: vi.fn().mockResolvedValue({
        snapshot: {
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
          text: "Dashboard loaded",
          elements: [],
          activeElement: null,
          dialogs: [],
          obstruction: null,
        },
        target: {
          selector: "#submit",
          found: true,
          obscured: true,
          obstructionReason: "Another element is receiving pointer hits at the target center point.",
        },
        metrics: {
          sampledAt: "2026-03-27T00:00:00.000Z",
          url: "http://127.0.0.1:4173/",
          title: "Preview App",
        },
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    const inspection = await service.inspect("session-1", "#submit");
    __jait_capture(0, (browser.inspect.mock.calls));
    __jait_capture(1, (inspection?.target));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_467_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockResolvedValue(undefined),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue(null),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    const session = await service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    __jait_capture(0, (surfaceRegistry.startSurface.mock.calls));
    __jait_capture(1, (session.status));
    __jait_capture(2, (session.url));
    __jait_captureType(3, (session.remoteBrowser));
    __jait_capture(4, (session.lastError));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_preview_test_ts_509_3": {


const screenshotDir = resolve(__jait_original_dir, "../../../../.jait/shots");
/*__jait_scope_open__*/{

try {
await (async()=>{

    let resolveNavigate: (() => void) | null = null;
    const browser = {
      type: "browser",
      state: "running",
      navigate: vi.fn().mockImplementation(() => new Promise<void>((resolve) => {
        resolveNavigate = resolve;
      })),
      getEvents: vi.fn().mockReturnValue([]),
      getLiveViewInfo: vi.fn().mockReturnValue({
        display: ":99",
        vncPort: 5900,
        websockifyPort: 6080,
        novncUrl: "ws://127.0.0.1:6080",
      }),
      getMetrics: vi.fn().mockResolvedValue({
        sampledAt: "2026-03-27T00:00:00.000Z",
        url: "http://127.0.0.1:4173/",
        title: "Preview App",
      }),
    };
    const surfaceRegistry = {
      stopSurface: vi.fn().mockResolvedValue(undefined),
      startSurface: vi.fn().mockResolvedValue(browser),
      getSurface: vi.fn().mockReturnValue(browser),
    };
    const service = new PreviewService(surfaceRegistry as any);
    (service as any).runner = {
      mode: "local",
      start: vi.fn(),
      stop: vi.fn(),
    };

    const first = service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });
    const second = service.start({
      sessionId: "session-1",
      projectRoot: "/project/app",
      target: "4173",
    });

    await new Promise((resolve) => setTimeout(resolve, 0));
    __jait_capture(0, (browser.navigate.mock.calls));
    resolveNavigate?.();
    const [firstSession, secondSession] = await Promise.all([first, second]);

    __jait_capture(1, (firstSession.status));
    __jait_capture(2, (secondSession.status));
    __jait_capture(3, (surfaceRegistry.startSurface.mock.calls));
    __jait_capture(4, (browser.navigate.mock.calls));
  
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
