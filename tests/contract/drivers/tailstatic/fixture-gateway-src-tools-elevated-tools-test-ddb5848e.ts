// Translated fixture from packages/gateway/src/tools/elevated-tools.test.ts; expected literals are in tail_static.rs.
import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import type { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { SecretInputService } from "../../../../packages/gateway/src/services/secret-input.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { buildToolSchemas } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { createToolRegistry } from "../../../../packages/gateway/src/tools/index.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createElevatedRunTool, type ElevatedSpawnFactory } from "../../../../packages/gateway/src/tools/elevated-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/elevated-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_elevated_tools_test_ts_78_3": {


function context(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "elevated-test-session",
    actionId: "elevated-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "sudo-password") {
  let service: SecretInputService;
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  service = new SecretInputService({
    onRequest: (request) => {
      requests.push({
        title: request.title,
        prompt: request.prompt,
        requestedBy: request.requestedBy,
      });
      queueMicrotask(() => service.submit(request.id, secret, "user-1"));
    },
  });
  return { service, requests, secret };
}
class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdinWrites: string[] = [];
  constructor(private readonly onStdinWrite?: (chunk: string, proc: FakeSpawnedProcess) => void) {
    super();
  }
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinWrites.push(chunk);
      this.onStdinWrite?.(chunk, this);
    },
  };

  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}
function fakeSpawnFactory(onSpawn?: (command: string, args: string[], proc: FakeSpawnedProcess) => void) {
  const calls: Array<{ command: string; args: string[]; proc: FakeSpawnedProcess }> = [];
  const factory: ElevatedSpawnFactory = (command, args) => {
    const proc = new FakeSpawnedProcess((chunk, current) => {
      if (chunk.includes("sudo-password")) {
        current.stdout.write("root-owned output\n");
        current.emit("close", 0, null);
      }
    });
    calls.push({ command, args, proc });
    onSpawn?.(command, args, proc);
    return proc;
  };
  return { factory, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, requests, secret } = autoSubmitSecret();
    const { factory, calls } = fakeSpawnFactory();
    const registry = new ToolRegistry();
    registry.register(createElevatedRunTool(service, factory, {
      platform: () => "linux",
      getuid: () => 1000,
    }));
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "elevated.run",
      {
        command: "apt-get update",
        reason: "install system packages",
      },
      context(),
      audit,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { output: string }).output));
    __jait_capture(2, (requests));
    __jait_capture(3, (calls[0]?.command));
    __jait_capture(4, (calls[0]?.args));
    __jait_capture(5, (JSON.stringify(auditEntries)), (secret));
    __jait_capture(6, (auditEntries[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_elevated_tools_test_ts_122_3": {


function context(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "elevated-test-session",
    actionId: "elevated-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "sudo-password") {
  let service: SecretInputService;
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  service = new SecretInputService({
    onRequest: (request) => {
      requests.push({
        title: request.title,
        prompt: request.prompt,
        requestedBy: request.requestedBy,
      });
      queueMicrotask(() => service.submit(request.id, secret, "user-1"));
    },
  });
  return { service, requests, secret };
}
class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdinWrites: string[] = [];
  constructor(private readonly onStdinWrite?: (chunk: string, proc: FakeSpawnedProcess) => void) {
    super();
  }
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinWrites.push(chunk);
      this.onStdinWrite?.(chunk, this);
    },
  };

  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}
function fakeSpawnFactory(onSpawn?: (command: string, args: string[], proc: FakeSpawnedProcess) => void) {
  const calls: Array<{ command: string; args: string[]; proc: FakeSpawnedProcess }> = [];
  const factory: ElevatedSpawnFactory = (command, args) => {
    const proc = new FakeSpawnedProcess((chunk, current) => {
      if (chunk.includes("sudo-password")) {
        current.stdout.write("root-owned output\n");
        current.emit("close", 0, null);
      }
    });
    calls.push({ command, args, proc });
    onSpawn?.(command, args, proc);
    return proc;
  };
  return { factory, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tools = createToolRegistry(new SurfaceRegistry(), {
      secretInputService: new SecretInputService(),
    });

    const schemas = buildToolSchemas(tools);
    const byName = new Map(schemas.map((schema) => [schema.function.name, schema]));

    __jait_capture(0, (byName.has("elevated_run")));
    __jait_capture(1, (byName.get("elevated_run")?.function.parameters));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_elevated_tools_test_ts_136_3": {


function context(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "elevated-test-session",
    actionId: "elevated-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "sudo-password") {
  let service: SecretInputService;
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  service = new SecretInputService({
    onRequest: (request) => {
      requests.push({
        title: request.title,
        prompt: request.prompt,
        requestedBy: request.requestedBy,
      });
      queueMicrotask(() => service.submit(request.id, secret, "user-1"));
    },
  });
  return { service, requests, secret };
}
class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdinWrites: string[] = [];
  constructor(private readonly onStdinWrite?: (chunk: string, proc: FakeSpawnedProcess) => void) {
    super();
  }
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinWrites.push(chunk);
      this.onStdinWrite?.(chunk, this);
    },
  };

  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}
function fakeSpawnFactory(onSpawn?: (command: string, args: string[], proc: FakeSpawnedProcess) => void) {
  const calls: Array<{ command: string; args: string[]; proc: FakeSpawnedProcess }> = [];
  const factory: ElevatedSpawnFactory = (command, args) => {
    const proc = new FakeSpawnedProcess((chunk, current) => {
      if (chunk.includes("sudo-password")) {
        current.stdout.write("root-owned output\n");
        current.emit("close", 0, null);
      }
    });
    calls.push({ command, args, proc });
    onSpawn?.(command, args, proc);
    return proc;
  };
  return { factory, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { factory, calls } = fakeSpawnFactory((command, args, proc) => {
      if (command !== "powershell.exe") return;
      queueMicrotask(() => {
        __jait_capture(0, (args));
        // Decode the EncodedCommand and verify it uses -Verb RunAs (UAC path)
        const encodedIdx = args.indexOf("-EncodedCommand");
        const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le");
        __jait_capture(1, (script));
        __jait_capture(2, (script));
        proc.stdout.write(JSON.stringify({
          exitCode: 0,
          stdout: "uac-elevated-output\n",
          stderr: "",
        }));
        proc.emit("close", 0, null);
      });
    });
    const tool = createElevatedRunTool(undefined, factory, {
      platform: () => "win32",
      getuid: () => undefined,
    });

    const result = await tool.execute({
      command: "Get-Service",
    }, context());

    __jait_capture(3, (result.ok));
    __jait_capture(4, ((result.data as { output: string }).output));
    // UAC mode should not require the secret input service at all
    __jait_capture(5, (calls[0]?.command));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_elevated_tools_test_ts_169_3": {


function context(overrides: Record<string, unknown> = {}) {
  return {
    sessionId: "elevated-test-session",
    actionId: "elevated-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "sudo-password") {
  let service: SecretInputService;
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  service = new SecretInputService({
    onRequest: (request) => {
      requests.push({
        title: request.title,
        prompt: request.prompt,
        requestedBy: request.requestedBy,
      });
      queueMicrotask(() => service.submit(request.id, secret, "user-1"));
    },
  });
  return { service, requests, secret };
}
class FakeSpawnedProcess extends EventEmitter {
  readonly stdout = new PassThrough();
  readonly stderr = new PassThrough();
  readonly stdinWrites: string[] = [];
  constructor(private readonly onStdinWrite?: (chunk: string, proc: FakeSpawnedProcess) => void) {
    super();
  }
  readonly stdin = {
    write: (chunk: string) => {
      this.stdinWrites.push(chunk);
      this.onStdinWrite?.(chunk, this);
    },
  };

  kill(): boolean {
    this.emit("close", 143, "SIGTERM");
    return true;
  }
}
function fakeSpawnFactory(onSpawn?: (command: string, args: string[], proc: FakeSpawnedProcess) => void) {
  const calls: Array<{ command: string; args: string[]; proc: FakeSpawnedProcess }> = [];
  const factory: ElevatedSpawnFactory = (command, args) => {
    const proc = new FakeSpawnedProcess((chunk, current) => {
      if (chunk.includes("sudo-password")) {
        current.stdout.write("root-owned output\n");
        current.emit("close", 0, null);
      }
    });
    calls.push({ command, args, proc });
    onSpawn?.(command, args, proc);
    return proc;
  };
  return { factory, calls };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, requests, secret } = autoSubmitSecret();
    const { factory, calls } = fakeSpawnFactory((command, args, proc) => {
      if (command !== "powershell.exe") return;
      queueMicrotask(() => {
        __jait_capture(0, (args));
        // Verify credential-based path (not UAC) when username is provided
        const encodedIdx = args.indexOf("-EncodedCommand");
        const script = Buffer.from(args[encodedIdx + 1], "base64").toString("utf16le");
        __jait_capture(1, (script));
        __jait_capture(2, (script));
        proc.stdout.write(JSON.stringify({
          exitCode: 0,
          stdout: "windows-admin-output\n",
          stderr: "",
        }));
        proc.emit("close", 0, null);
      });
    });
    const registry = new ToolRegistry();
    registry.register(createElevatedRunTool(service, factory, {
      platform: () => "win32",
      getuid: () => undefined,
    }));
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "elevated.run",
      {
        command: "Get-Service",
        username: ".\\Administrator",
        reason: "inspect local services",
      },
      context(),
      audit,
    );

    __jait_capture(3, (result.ok));
    __jait_capture(4, ((result.data as { output: string }).output));
    __jait_capture(5, (requests));
    __jait_capture(6, (calls[0]?.command));
    __jait_capture(7, (JSON.stringify(calls[0])), (secret));
    __jait_capture(8, (JSON.stringify(auditEntries)), (secret));
    __jait_capture(9, (auditEntries[0]));
  
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
