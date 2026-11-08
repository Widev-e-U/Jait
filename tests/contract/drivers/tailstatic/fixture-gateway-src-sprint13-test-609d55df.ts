// Translated fixture from packages/gateway/src/sprint13.test.ts; expected literals are in tail_static.rs.
import { tmpdir } from "node:os";
import { join } from "node:path";
import { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import { createTerminalRunTool } from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { createBrowserSandboxStartTool } from "../../../../packages/gateway/src/tools/browser-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/sprint13.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_sprint13_test_ts_27_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const manager = new SandboxManager(async () => ({
      output: "inside-container",
      exitCode: 0,
      timedOut: false,
    }));

    const tool = createTerminalRunTool(new SurfaceRegistry(), manager);
    const result = await tool.execute(
      { command: "pwd", sandbox: true, timeout: 3000 },
      baseContext,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_48_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    let captured: string[] = [];
    const manager = new SandboxManager(async (cmd, _timeoutMs) => {
      captured = cmd;
      return {
        output: "killed",
        exitCode: null,
        timedOut: true,
      };
    });

    const result = await manager.runCommand({
      command: "sleep 99",
      projectRoot: testProject,
      timeoutMs: 1000,
      mountMode: "read-only",
      networkEnabled: false,
      memoryLimitMb: 128,
      cpuLimit: "0.5",
    });

    __jait_capture(0, (result.timedOut));
    __jait_capture(1, (captured.join(" ")));
    __jait_capture(2, (captured.join(" ")));
    __jait_capture(3, (captured.join(" ")));
    __jait_capture(4, (captured.join(" ")));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_76_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const manager = new SandboxManager(async () => ({
      output: "container-id",
      exitCode: 0,
      timedOut: false,
    }));

    const tool = createBrowserSandboxStartTool(manager);
    const result = await tool.execute({ novncPort: 6600, vncPort: 6000 }, baseContext);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (globalThis.fetch.mock.calls));
    __jait_capture(2, (result.data));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_98_3_each0": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
/*__jait_scope_open__*/{
const stagehand = false;
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return {
        output: "container-id",
        exitCode: 0,
        timedOut: false,
      };
    });

    const result = await manager.startBrowserSandbox({
      projectRoot: testProject,
      mountMode: "none",
      networkEnabled: true,
      hostGateway: true,
      novncPort: 6601,
      vncPort: 6001,
      cdpPort: 9223,
      ...(stagehand ? { stagehandExtensionPath: "/sdk/extension" } : {}),
      waitForCdp: false,
    });

    __jait_capture(0, (result));
    const imageInspectCmd = commands.find((c) => c.join(" ").includes("image inspect"));
    __jait_capture(1, (imageInspectCmd?.join(" ")));
    const runCmd = commands.find((c) => c.join(" ").includes("--add-host"));
    __jait_capture(2, (runCmd?.join(" ")));
    __jait_capture(3, (runCmd?.join(" ")), (stagehand ? "-p 127.0.0.1:9223:9223" : "-p 9223:9223"));
    if (stagehand) {
      __jait_capture(4, (runCmd?.join(" ")));
      __jait_capture(5, (runCmd?.join(" ")));
    } else {
      __jait_capture(6, (runCmd?.join(" ")));
    }
    __jait_capture(7, (runCmd?.join(" ")));
  
})();

} finally {
await __jait_hook_737();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_98_3_each1": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
/*__jait_scope_open__*/{
const stagehand = true;
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return {
        output: "container-id",
        exitCode: 0,
        timedOut: false,
      };
    });

    const result = await manager.startBrowserSandbox({
      projectRoot: testProject,
      mountMode: "none",
      networkEnabled: true,
      hostGateway: true,
      novncPort: 6601,
      vncPort: 6001,
      cdpPort: 9223,
      ...(stagehand ? { stagehandExtensionPath: "/sdk/extension" } : {}),
      waitForCdp: false,
    });

    __jait_capture(0, (result));
    const imageInspectCmd = commands.find((c) => c.join(" ").includes("image inspect"));
    __jait_capture(1, (imageInspectCmd?.join(" ")));
    const runCmd = commands.find((c) => c.join(" ").includes("--add-host"));
    __jait_capture(2, (runCmd?.join(" ")));
    __jait_capture(3, (runCmd?.join(" ")), (stagehand ? "-p 127.0.0.1:9223:9223" : "-p 9223:9223"));
    if (stagehand) {
      __jait_capture(4, (runCmd?.join(" ")));
      __jait_capture(5, (runCmd?.join(" ")));
    } else {
      __jait_capture(6, (runCmd?.join(" ")));
    }
    __jait_capture(7, (runCmd?.join(" ")));
  
})();

} finally {
await __jait_hook_737();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_141_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    let runAttempts = 0;
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      const joined = cmd.join(" ");
      if (joined.includes(" ps ") && joined.includes("{{.Ports}}")) {
        return {
          output: "jait-browser-sb-old\t0.0.0.0:6080->6080/tcp, 0.0.0.0:5900->5900/tcp",
          exitCode: 0,
          timedOut: false,
        };
      }
      if (joined.includes(" ps ") && joined.includes("{{.Names}}")) {
        return { output: "", exitCode: 0, timedOut: false };
      }
      if (joined.includes("image inspect")) {
        return { output: "[]", exitCode: 0, timedOut: false };
      }
      if (cmd.includes("run")) {
        runAttempts += 1;
        if (runAttempts === 1) {
          return {
            output: "docker: Error response from daemon: Bind for 0.0.0.0:6080 failed: port is already allocated",
            exitCode: 125,
            timedOut: false,
          };
        }
      }
      return { output: "container-id", exitCode: 0, timedOut: false };
    });

    const result = await manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6080,
      vncPort: 5900,
    });

    __jait_capture(0, (result));
    __jait_capture(1, (commands.some((cmd) => cmd.includes("ps") && cmd.includes("--format"))));
    __jait_capture(2, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-old"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_188_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const manager = new SandboxManager(async (cmd) => {
      if (cmd.includes("info")) {
        return { output: "", exitCode: null, timedOut: true };
      }
      return { output: "unexpected", exitCode: 0, timedOut: false };
    });

    await __jait_rejected(0, manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6082,
      vncPort: 5902,
    }));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_203_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return { output: "jait-browser-sb-active", exitCode: 0, timedOut: false };
      }
      return { output: "ok", exitCode: 0, timedOut: false };
    });

    await __jait_captureResolved(0, (manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6083,
      vncPort: 5903,
    })));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("image inspect"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_224_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: "jait-browser-sb-active-1\njait-browser-sb-active-2",
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "ok", exitCode: 0, timedOut: false };
    });

    await __jait_rejected(0, manager.startBrowserSandbox({
      projectRoot: testProject,
      novncPort: 6083,
      vncPort: 5903,
    }));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("image inspect"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_246_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const now = Date.now();
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: [
            `jait-browser-sb-old\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-browser-sb-active\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-browser-sb-fresh\tignored\tjait.kind=browser-sandbox,jait.createdAt=${now}`,
          ].join("\n"),
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    const stopped = await manager.cleanupBrowserSandboxes({
      maxAgeMs: 60 * 60 * 1000,
      excludeNames: ["jait-browser-sb-active"],
    });

    __jait_capture(0, (stopped));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-old"))));
    __jait_capture(2, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-active"))));
    __jait_capture(3, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-fresh"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_276_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: "jait-browser-sb-legacy\t2026-04-29 20:00:10 +0000 UTC\t",
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    const stopped = await manager.cleanupBrowserSandboxes({ maxAgeMs: 60 * 60 * 1000 });

    __jait_capture(0, (stopped));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-browser-sb-legacy"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_296_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return {
        output: "container-id",
        exitCode: 0,
        timedOut: false,
      };
    });

    const result = await manager.startLinuxDesktopSandbox({
      projectRoot: testProject,
      mountMode: "none",
      networkEnabled: true,
      hostGateway: true,
      novncPort: 6602,
      vncPort: 6002,
      cdpPort: 9224,
      waitForCdp: false,
      screenRes: "1280x720x24",
    });

    __jait_capture(0, (result));
    const imageInspectCmd = commands.find((c) => c.join(" ").includes("image inspect"));
    __jait_capture(1, (imageInspectCmd?.join(" ")));
    const runCmd = commands.find((c) => c.join(" ").includes("--add-host"));
    __jait_capture(2, (runCmd?.join(" ")));
    __jait_capture(3, (runCmd?.join(" ")));
    __jait_capture(4, (runCmd?.join(" ")));
    __jait_capture(5, (runCmd?.join(" ")));
    __jait_capture(6, (runCmd?.join(" ")));
    __jait_capture(7, (runCmd?.join(" ")));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_336_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    let runAttempts = 0;
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      const joined = cmd.join(" ");
      if (joined.includes(" ps ") && joined.includes("{{.Ports}}")) {
        return {
          output: "jait-linux-desktop-sb-old\t0.0.0.0:6080->6080/tcp, 0.0.0.0:5900->5900/tcp",
          exitCode: 0,
          timedOut: false,
        };
      }
      if (joined.includes(" ps ") && joined.includes("{{.Names}}")) {
        return { output: "", exitCode: 0, timedOut: false };
      }
      if (joined.includes("image inspect")) {
        return { output: "[]", exitCode: 0, timedOut: false };
      }
      if (cmd.includes("run")) {
        runAttempts += 1;
        if (runAttempts === 1) {
          return {
            output: "docker: Error response from daemon: Bind for 0.0.0.0:6080 failed: port is already allocated",
            exitCode: 125,
            timedOut: false,
          };
        }
      }
      return { output: "container-id", exitCode: 0, timedOut: false };
    });

    const result = await manager.startLinuxDesktopSandbox({
      projectRoot: testProject,
      novncPort: 6080,
      vncPort: 5900,
    });

    __jait_capture(0, (result));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-linux-desktop-sb-old"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_382_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const manager = new SandboxManager(async (cmd) => {
      if (cmd.includes("info")) {
        return { output: "", exitCode: null, timedOut: true };
      }
      return { output: "unexpected", exitCode: 0, timedOut: false };
    });

    await __jait_rejected(0, manager.startLinuxDesktopSandbox({
      projectRoot: testProject,
      novncPort: 6084,
      vncPort: 5904,
    }));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_397_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return { output: "jait-linux-desktop-sb-active", exitCode: 0, timedOut: false };
      }
      return { output: "ok", exitCode: 0, timedOut: false };
    });

    await __jait_rejected(0, manager.startLinuxDesktopSandbox({
      projectRoot: testProject,
      novncPort: 6085,
      vncPort: 5905,
    }));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("image inspect"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_415_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const now = Date.now();
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      if (cmd.includes("ps")) {
        return {
          output: [
            `jait-linux-desktop-sb-old\tignored\tjait.kind=linux-desktop-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-linux-desktop-sb-active\tignored\tjait.kind=linux-desktop-sandbox,jait.createdAt=${now - 2 * 60 * 60 * 1000}`,
            `jait-linux-desktop-sb-fresh\tignored\tjait.kind=linux-desktop-sandbox,jait.createdAt=${now}`,
          ].join("\n"),
          exitCode: 0,
          timedOut: false,
        };
      }
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    const stopped = await manager.cleanupLinuxDesktopSandboxes({
      maxAgeMs: 60 * 60 * 1000,
      excludeNames: ["jait-linux-desktop-sb-active"],
    });

    __jait_capture(0, (stopped));
    __jait_capture(1, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-linux-desktop-sb-old"))));
    __jait_capture(2, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-linux-desktop-sb-active"))));
    __jait_capture(3, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-linux-desktop-sb-fresh"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
case "tailstatic_packages_gateway_src_sprint13_test_ts_445_3": {


const testProject = join(__jait_fixture_dir, "jait-test-sandbox");
const baseContext = {
  actionId: "a1",
  sessionId: "s1",
  projectRoot: testProject,
  requestedBy: "test",
};
/*__jait_scope_open__*/{
const __jait_hook_630 = () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true } as Response);
  };
const __jait_hook_737 = () => {
    vi.restoreAllMocks();
  };
await __jait_hook_630();
try {
await (async()=>{

    const commands: string[][] = [];
    const manager = new SandboxManager(async (cmd) => {
      commands.push(cmd);
      return { output: "removed", exitCode: 0, timedOut: false };
    });

    await manager.stopLinuxDesktopSandbox("jait-linux-desktop-sb-abc");

    __jait_capture(0, (commands.some((cmd) => cmd.join(" ").includes("rm -f jait-linux-desktop-sb-abc"))));
  
})();

} finally {
await __jait_hook_737();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
