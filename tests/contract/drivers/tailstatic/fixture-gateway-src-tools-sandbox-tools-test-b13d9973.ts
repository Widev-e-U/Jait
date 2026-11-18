// Translated fixture from packages/gateway/src/tools/sandbox-tools.test.ts; expected literals are in tail_static.rs.
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import {
  createLinuxDesktopSandboxStartTool,
  createLinuxDesktopSandboxStopTool,
  createWindowsSandboxStartTool,
  createWindowsSandboxStopTool,
} from "../../../../packages/gateway/src/tools/sandbox-tools.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/sandbox-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_52_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: Array<Record<string, unknown>> = [];
    const tool = createWindowsSandboxStartTool(fakeManager({
      startWindowsSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-windows-sb-test",
          browserId: "jait-windows-sb-test",
          rdpPort: 3390,
          webViewerPort: 8007,
          rdpUrl: "rdp://127.0.0.1:3390",
          webViewerUrl: "http://127.0.0.1:8007/",
          status: "running",
          version: "10",
          storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
          sshPort: 2223,
          sshUsername: "Docker",
          sshPassword: "admin",
        };
      },
    }));

    __jait_capture(0, (tool.name));
    __jait_capture(1, (tool.parameters.properties));
    __jait_capture(2, (tool.parameters.properties));
    __jait_capture(3, (tool.parameters.properties));
    __jait_capture(4, (tool.parameters.properties));

    const result = await tool.execute(
      {
        ramSize: "8G",
        cpuCores: 8,
        diskSize: "128G",
        windowsVersion: "10",
        rdpPort: 3390,
        webViewerPort: 8007,
        waitForWebViewer: true,
      },
      baseContext,
    );

    __jait_capture(5, (calls));
    __jait_capture(6, (result.ok));
    __jait_capture(7, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_116_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tool = createWindowsSandboxStartTool(fakeManager());
    const result = await tool.execute({}, baseContext);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_127_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: Array<{ name: string; options: unknown }> = [];
    const tool = createWindowsSandboxStopTool(fakeManager({
      stopWindowsSandbox: async (name, options) => {
        calls.push({ name, options });
      },
    }));

    __jait_capture(0, (tool.name));
    __jait_capture(1, (tool.parameters.required));

    const result = await tool.execute(
      { containerName: "jait-windows-sb-test", removeStorage: true },
      baseContext,
    );

    __jait_capture(2, (calls));
    __jait_capture(3, (result.ok));
    __jait_capture(4, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_152_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: Array<Record<string, unknown>> = [];
    const tool = createLinuxDesktopSandboxStartTool(fakeManager({
      startLinuxDesktopSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-linux-desktop-sb-test",
          novncUrl: "http://127.0.0.1:6081/vnc_lite.html",
          vncPort: 5901,
          novncPort: 6081,
          cdpUrl: "http://127.0.0.1:9224",
        };
      },
    }));

    __jait_capture(0, (tool.name));
    __jait_capture(1, (tool.parameters.properties));
    __jait_capture(2, (tool.parameters.properties));
    __jait_capture(3, (tool.parameters.properties));

    const result = await tool.execute(
      {
        screenRes: "1280x720x24",
        mountMode: "read-write",
        networkEnabled: false,
        novncPort: 6081,
        vncPort: 5901,
        cdpPort: 9224,
        waitForCdp: false,
        hostGateway: true,
      },
      baseContext,
    );

    __jait_capture(4, (calls), ([
      {
        projectRoot: testProject,
        screenRes: "1280x720x24",
        mountMode: "read-write",
        networkEnabled: false,
        novncPort: 6081,
        vncPort: 5901,
        cdpPort: 9224,
        waitForCdp: false,
        hostGateway: true,
      },
    ]));
    __jait_capture(5, (result.ok));
    __jait_capture(6, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_206_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: Array<Record<string, unknown>> = [];
    const tool = createLinuxDesktopSandboxStartTool(fakeManager({
      startLinuxDesktopSandbox: async (options) => {
        calls.push(options as unknown as Record<string, unknown>);
        return {
          containerName: "jait-linux-desktop-sb-test",
          novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
          vncPort: 5900,
          novncPort: 6080,
        };
      },
    }));

    await tool.execute({}, baseContext);

    __jait_capture(0, (calls[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_sandbox_tools_test_ts_227_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox-tools");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
function fakeManager(overrides: Partial<SandboxManager> = {}): SandboxManager {
  return {
    startWindowsSandbox: async () => ({
      containerName: "jait-windows-sb-test",
      browserId: "jait-windows-sb-test",
      rdpPort: 3389,
      webViewerPort: 8006,
      rdpUrl: "rdp://127.0.0.1:3389",
      webViewerUrl: "http://127.0.0.1:8006/",
      status: "starting",
      version: "11",
      storageDir: "/tmp/jait-windows-sandbox/jait-windows-sb-test",
      sshPort: 2222,
      sshUsername: "Docker",
      sshPassword: "admin",
    }),
    stopWindowsSandbox: async () => {},
    startLinuxDesktopSandbox: async () => ({
      containerName: "jait-linux-desktop-sb-test",
      novncUrl: "http://127.0.0.1:6080/vnc_lite.html",
      vncPort: 5900,
      novncPort: 6080,
      cdpUrl: "http://127.0.0.1:9223",
    }),
    stopLinuxDesktopSandbox: async () => {},
    ...overrides,
  } as unknown as SandboxManager;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: string[] = [];
    const tool = createLinuxDesktopSandboxStopTool(fakeManager({
      stopLinuxDesktopSandbox: async (name) => {
        calls.push(name);
      },
    }));

    __jait_capture(0, (tool.name));
    __jait_capture(1, (tool.parameters.required));

    const result = await tool.execute(
      { containerName: "jait-linux-desktop-sb-test" },
      baseContext,
    );

    __jait_capture(2, (calls));
    __jait_capture(3, (result.ok));
    __jait_capture(4, (result.data));
  
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
