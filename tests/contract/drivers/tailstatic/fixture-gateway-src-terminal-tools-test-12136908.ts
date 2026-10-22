// Translated fixture from packages/gateway/src/terminal-tools.test.ts; expected literals are in tail_static.rs.
import {
  createTerminalRunTool,
  getManagedTerminalExecution,
  getManagedTerminalExecutions,
  detectInteractivePrompt,
  rewriteProjectPathForSandboxCommand,
  buildAgentCommand,
} from "../../../../packages/gateway/src/tools/terminal-tools.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { SandboxManager } from "../../../../packages/gateway/src/security/sandbox-manager.js";
import { TerminalSurfaceFactory, type TerminalSurface } from "../../../../packages/gateway/src/surfaces/terminal.js";
import { SecretInputService } from "../../../../packages/gateway/src/services/secret-input.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import type { WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/terminal-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_128_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const sandbox = sandboxFixture(async () => ({ output: "done", exitCode: 0, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "echo hi", sandbox: true }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).exitCode));
    __jait_capture(3, ((result.data as any).timedOut));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_140_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const commands: string[][] = [];
    const sandbox = sandboxFixture(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait" };

    await tool.execute({ command: "cd /tmp/alice/jait && bun test", sandbox: true }, context);

    __jait_capture(0, (commands[0]));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_154_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "cat '/tmp/alice/jait/packages/gateway/src/tools/terminal-tools.ts'";

    const rewritten = rewriteProjectPathForSandboxCommand(command, "/tmp/alice/jait");

    __jait_capture(0, (rewritten));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_162_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "echo /tmp/alice/jait-backup && cat /tmp/tmp/alice/jait";

    const rewritten = rewriteProjectPathForSandboxCommand(command, "/tmp/alice/jait");

    __jait_capture(0, (rewritten), (command));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_170_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const commands: string[][] = [];
    const sandbox = sandboxFixture(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait", sandboxContainerName: "jait-agent-sb-test" };

    const result = await tool.execute({ command: "pwd", sandbox: true }, context);

    __jait_capture(0, (result.ok));
    // Container runtime is docker or podman depending on the host (see containerBinary()).
    __jait_capture(1, (commands[0]![0]));
    __jait_capture(2, (commands[0]!.slice(1)));
    __jait_capture(3, ((result.data as any).threadSandbox));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_188_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const commands: string[][] = [];
    const sandbox = sandboxFixture(async (cmd) => {
      commands.push(cmd);
      return { output: "done", exitCode: 0, timedOut: false };
    });
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);
    const context = { ...makeContext(), projectRoot: "/tmp/alice/jait", sandboxContainerName: "jait-agent-sb-test" };

    await tool.execute({ command: "cd /tmp/alice/jait && bun test", sandbox: true }, context);

    __jait_capture(0, (commands[0]));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_202_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const sandbox = sandboxFixture(async () => ({ output: "error", exitCode: 1, timedOut: false }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "bad-command", sandbox: true }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).output));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_213_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const sandbox = sandboxFixture(async () => ({
      output: "[timeout after 1000ms]",
      exitCode: null,
      timedOut: true,
    }));
    const tool = createTerminalRunTool(new SurfaceRegistry(), sandbox);

    const result = await tool.execute({ command: "sleep 20", timeout: 1000, sandbox: true }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).timedOut));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_228_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const events: Array<{ sessionId: string; userId?: string; payload: unknown }> = [];
    const writes: string[] = [];
    const surface = {
      id: "term-bind",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return 7; },
      addOutputListener() {},
      removeOutputListener() {},
      write(data: string) {
        // The card cannot attach to output it has already missed, so the
        // binding has to be out before the first byte reaches the shell.
        __jait_capture(0, (events));
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const ws = {
      broadcastTerminalExecution(sessionId: string, userId: string | undefined, payload: unknown) {
        events.push({ sessionId, userId, payload });
      },
    } as unknown as WsControlPlane;
    const tool = createTerminalRunTool(registry, undefined, ws);

    await tool.execute(
      { command: "printf hi", terminalId: "term-bind", isBackground: true },
      { ...makeContext(), userId: "u-test" },
    );

    __jait_capture(1, (writes));
    __jait_capture(2, (events[0]));
    // The command's full output belongs on the terminal stream, not on every
    // binding event.
    __jait_capture(3, (events[0]?.payload));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_286_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const events: Array<{ payload: { terminalId: string; execution: Record<string, unknown> | null } }> = [];
    let outputOffset = 4;
    let listener: ((data: string) => void) | null = null;
    const writes: string[] = [];
    const surface = {
      id: "term-bind-done",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return outputOffset; },
      addOutputListener(next: (data: string) => void) { listener = next; },
      removeOutputListener() { listener = null; },
      write(data: string) { writes.push(data); },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const ws = {
      broadcastTerminalExecution(_sessionId: string, _userId: string | undefined, payload: never) {
        events.push({ payload });
      },
    } as unknown as WsControlPlane;
    const tool = createTerminalRunTool(registry, undefined, ws);

    await tool.execute(
      { command: "printf hi", terminalId: "term-bind-done", isBackground: true },
      makeContext(),
    );
    const completionToken = writes[0]?.match(/__JAIT_BACKGROUND_DONE_[0-9a-f-]+__/)?.[0];
    outputOffset = 9;
    listener?.(`printf hi\r\nhi\r\n${completionToken}:0\r\n`);

    __jait_capture(0, (events.at(-1)?.payload.execution));
    __jait_captureType(1, (events.at(-1)?.payload.execution?.completedAt));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_331_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const writes: string[] = [];
    const surface = {
      id: "term-existing",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return 4; },
      addOutputListener() {},
      removeOutputListener() {},
      write(data: string) {
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    const result = await tool.execute({ command: "printf hi", terminalId: "term-existing", isBackground: true }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    const [agentCommand, sentinel] = (writes[0] ?? "").split("\n");
    __jait_capture(2, (agentCommand), (buildAgentCommand("printf hi", "/bin/bash")));
    __jait_capture(3, (sentinel));
    __jait_capture(4, (getManagedTerminalExecution("term-existing")));
    backgroundCommandMonitor.clearForTests();
    __jait_captureType(5, (getManagedTerminalExecution("term-existing")));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_370_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const writes: string[] = [];
    let outputOffset = 4;
    let listener: ((data: string) => void) | null = null;
    const surface = {
      id: "term-background-range",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return outputOffset; },
      addOutputListener(nextListener: (data: string) => void) {
        listener = nextListener;
      },
      removeOutputListener() {
        listener = null;
      },
      write(data: string) {
        writes.push(data);
      },
      snapshot() {
        return { metadata: { shell: "/bin/bash" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    await tool.execute(
      { command: "printf hi", terminalId: "term-background-range", isBackground: true },
      makeContext(),
    );
    const completionToken = writes[0]?.match(/__JAIT_BACKGROUND_DONE_[0-9a-f-]+__/)?.[0];
    __jait_captureType(0, (completionToken));

    outputOffset = 5;
    listener?.(`printf hi\r\nhi\r\n${completionToken}:0\r\n`);

    __jait_captureType(1, (getManagedTerminalExecution("term-background-range")));
    __jait_capture(2, (getManagedTerminalExecutions("term-background-range").at(-1)));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_420_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const registry = new SurfaceRegistry();
    registry.register(new TerminalSurfaceFactory());
    const tool = createTerminalRunTool(registry);

    // Foreground command creates + records the session default terminal.
    const fg1 = await tool.execute({ command: "printf fg1", timeout: 5000 }, makeContext());
    __jait_capture(0, (fg1.ok));
    const fgTerminalId = (fg1.data as any).terminalId as string;
    __jait_captureType(1, (fgTerminalId));
    __jait_capture(2, ((fg1.data as any).terminalOutput));

    // Background command must NOT reuse the session default terminal — otherwise
    // the next foreground command would be typed into a busy shell and Ctrl+C it.
    const bg = await tool.execute(
      { command: "printf bg", isBackground: true, timeout: 5000 },
      makeContext(),
    );
    __jait_capture(3, (bg.ok));
    const bgTerminalId = (bg.data as any).terminalId as string;
    __jait_captureType(4, (bgTerminalId));
    __jait_capture(5, (bgTerminalId), (fgTerminalId));

    // Next foreground command reuses the session default terminal.
    const fg2 = await tool.execute({ command: "printf fg2", timeout: 5000 }, makeContext());
    __jait_capture(6, (fg2.ok));
    __jait_capture(7, ((fg2.data as any).terminalId), (fgTerminalId));

    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_452_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const registry = new SurfaceRegistry();
    registry.register(new TerminalSurfaceFactory());
    const tool = createTerminalRunTool(registry);

    const waiting = await tool.execute(
      { command: "sleep 2", yieldTimeMs: 20 },
      makeContext(),
    );
    __jait_capture(0, (waiting.data));
    const busyTerminalId = (waiting.data as any).terminalId as string;
    __jait_capture(1, (backgroundCommandMonitor.hasWatcherForTerminal(busyTerminalId)));

    const next = await tool.execute(
      { command: "printf available", timeout: 1000 },
      makeContext(),
    );
    __jait_capture(2, (next.ok));
    __jait_capture(3, ((next.data as any).terminalId), (busyTerminalId));

    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_476_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const listeners = new Set<(data: string) => void>();
    const writes: string[] = [];
    const surface = {
      id: "term-watched",
      type: "terminal",
      state: "running",
      touch() {},
      getOutputOffset() { return writes.length; },
      addOutputListener(listener: (data: string) => void) { listeners.add(listener); },
      removeOutputListener(listener: (data: string) => void) { listeners.delete(listener); },
      write(data: string) { writes.push(data); },
      snapshot() { return { metadata: { shell: "/bin/bash" } }; },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    const background = await tool.execute(
      { command: "sleep 30", terminalId: "term-watched", isBackground: true },
      makeContext(),
    );
    __jait_capture(0, (background.ok));
    __jait_capture(1, (backgroundCommandMonitor.hasWatcherForTerminal("term-watched")));

    const foreground = await tool.execute(
      { command: "printf probe", terminalId: "term-watched", timeout: 5 },
      makeContext(),
    );

    __jait_capture(2, (foreground.ok));
    __jait_capture(3, (foreground.message));
    __jait_capture(4, (writes));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_512_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    backgroundCommandMonitor.clearForTests();
    const proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];
    const ws = {
      async proxyTerminalOp<T>(nodeId: string, op: string, params: Record<string, unknown>): Promise<T> {
        proxyCalls.push({ nodeId, op, params });
        return { ok: true, pid: 1234, shell: "pwsh.exe", reused: true } as T;
      },
      sendTerminalOp() {},
      broadcastTerminalExecution() {},
    } as unknown as WsControlPlane;
    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry, undefined, ws);

    const result = await tool.execute(
      { command: "Write-Output hi", terminalId: "term-existing", isBackground: true },
      { ...makeContext(), executionNodeId: "node-1" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).terminalId));
    __jait_capture(2, (proxyCalls[0]));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_541_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const proxyCalls: Array<{ nodeId: string; op: string; params: Record<string, unknown> }> = [];
    const ws = {
      async proxyTerminalOp<T>(nodeId: string, op: string, params: Record<string, unknown>): Promise<T> {
        proxyCalls.push({ nodeId, op, params });
        throw new Error("Terminal term-missing is not running on this node");
      },
      sendTerminalOp() {},
    } as unknown as WsControlPlane;
    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry, undefined, ws);

    const result = await tool.execute(
      { command: "Write-Output hi", terminalId: "term-missing" },
      { ...makeContext(), executionNodeId: "node-1" },
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (proxyCalls));
    __jait_capture(3, (proxyCalls[0]));
    __jait_capture(4, (registry.listSurfaces()));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_569_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new SurfaceRegistry();
    const tool = createTerminalRunTool(registry);

    const result = await tool.execute(
      { command: "printf hi", terminalId: "term-missing" },
      makeContext(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (registry.listSurfaces()));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_583_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool } = makePromptFallbackTool([
      "rg\r\nCommand 'rg' not found, but can be installed with:\r\nsudo apt install ripgrep\r\nalice@dev-host:~/jait$ ",
    ]);

    const result = await tool.execute({ command: "rg", terminalId: "term-existing", timeout: 1000 }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).timedOut));
    __jait_capture(3, ((result.data as any).output));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_596_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool } = makePromptFallbackTool([
      "pwd\r\n/tmp/alice/jait\r\n~/jait % ",
    ], "/bin/zsh");

    const result = await tool.execute({ command: "pwd", terminalId: "term-existing", timeout: 1000 }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).timedOut));
    __jait_capture(3, ((result.data as any).output));
    __jait_capture(4, ((result.data as any).output));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_610_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool } = makePromptFallbackTool([
      "echo hi\r\nhi\r\nalice@dev-host:~/jait$ ",
      "\r\nlate formatter output",
    ]);

    const result = await tool.execute({ command: "echo hi", terminalId: "term-existing", timeout: 1000 }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).timedOut));
    __jait_capture(2, ((result.data as any).output));
    __jait_capture(3, ((result.data as any).output));
    __jait_capture(4, ((result.data as any).output));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_625_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool, writes } = makePromptFallbackTool(["running without prompt\r\n"]);

    const result = await tool.execute({ command: "long-running", terminalId: "term-existing", yieldTimeMs: 20 }, makeContext());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((result.data as any).timedOut));
    __jait_capture(3, (writes));
    __jait_capture(4, (result.data));
    backgroundCommandMonitor.clearForTests();
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_638_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: writing a raw command into PowerShell's PSReadLine makes it
    // echo the command one character per frame, so the paste of a long
    // env-prefixed command interleaved with its own echo and executed twice.
    let listener: ((data: string) => void) | null = null;
    const writes: string[] = [];
    const surface = {
      id: "term-existing",
      type: "terminal",
      state: "running",
      touch() {},
      bracketedPasteEnabled: true,
      addOutputListener(cb: (data: string) => void) {
        listener = cb;
      },
      removeOutputListener() {
        listener = null;
      },
      write(data: string) {
        writes.push(data);
        const echo = data.replace(/\x1b\[20[01]~/g, "").replace(/\r$/, "");
        setTimeout(() => listener?.(`${echo}\r\nPS C:\\Tankstelle> `), 10);
      },
      snapshot() {
        return { metadata: { shell: "powershell.exe" } };
      },
    } as unknown as TerminalSurface;
    const registry = { getSurface: () => surface } as unknown as SurfaceRegistry;
    const tool = createTerminalRunTool(registry);

    const result = await tool.execute(
      { command: "Get-Location", terminalId: "term-existing", timeout: 1000 },
      makeContext(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (writes[0]), (`\x1b[200~${buildAgentCommand("Get-Location", "powershell.exe")}\x1b[201~\r`));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_679_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool, writes, requests } = makeSecretPromptTool();

    const result = await tool.execute({ command: "sudo whoami", terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).output));
    __jait_capture(2, (writes));
    __jait_capture(3, (requests));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_697_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { tool, writes, requests } = makeSecretPromptTool();

    const result = await tool.execute({ command: "ssh alice@host", terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as any).output));
    __jait_capture(2, (writes));
    __jait_capture(3, (requests));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_715_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    const command = "bunx vitest run packages/gateway/src/terminal-tools.test.ts";
    const { tool, writes, requests } = makeSecretPromptTool("unused-secret", {
      command,
      output: "[sudo] password for alice: \r\n✓ password fixture passed\r\n\x1b]633;D;0\x07\x1b]633;B\x07",
    });

    const result = await tool.execute({ command, terminalId: "term-existing", timeout: 1000 }, {
      ...makeContext(),
      userId: "user-1",
    });

    __jait_capture(0, (result.ok));
    __jait_capture(1, (requests));
    __jait_capture(2, (writes));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_735_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectInteractivePrompt("[sudo] password for alice:")));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
case "tailstatic_packages_gateway_src_terminal_tools_test_ts_739_3": {


function sandboxFixture(run: NonNullable<ConstructorParameters<typeof SandboxManager>[0]>) {
  const sandbox = new SandboxManager(run);
  vi.spyOn(sandbox, "startBackgroundCommand").mockImplementation(options => {
    let output = "";
    const completion = ("containerName" in options ? sandbox.execInContainer(options) : sandbox.runCommand(options))
      .then(result => { output = result.output; return result; });
    return { containerName: "containerName" in options ? options.containerName : "test-sandbox",
      get output() { return output; }, completion, stop: async () => {}, onOutput: () => () => {} };
  });
  return sandbox;
}
function makeContext() {
  return {
    sessionId: "s-test",
    actionId: "a-test",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function makePromptFallbackTool(chunks: string[], shell = "/bin/bash") {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      if (data.includes("\x03")) return;
      chunks.forEach((chunk, index) => {
        setTimeout(() => listener?.(chunk), index * 10);
      });
    },
    snapshot() {
      return { metadata: { shell } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry), writes };
}
function makeSecretPromptTool(
  secret = "remote-password",
  scriptedCommand?: { command: string; output: string },
) {
  let listener: ((data: string) => void) | null = null;
  const writes: string[] = [];
  const requests: Array<{ title: string; prompt: string; requestedBy: string | null }> = [];
  let service: SecretInputService;
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
  const surface = {
    id: "term-existing",
    type: "terminal",
    state: "running",
    touch() {},
    addOutputListener(cb: (data: string) => void) {
      listener = cb;
    },
    removeOutputListener() {
      listener = null;
    },
    write(data: string) {
      writes.push(data);
      // The tool prefixes agent commands with pager/editor-disabling env
      // assignments (buildAgentCommand), so match on the command suffix.
      if (scriptedCommand && data === buildAgentCommand(scriptedCommand.command, "/bin/bash") + "\r") {
        queueMicrotask(() => listener?.(scriptedCommand.output));
      }
      if (data.endsWith("ssh alice@host\r")) {
        queueMicrotask(() => listener?.("alice@host's password: "));
      }
      if (data.endsWith("sudo whoami\r")) {
        queueMicrotask(() => listener?.("[sudo] password for alice: "));
      }
      if (data === `${secret}\r`) {
        queueMicrotask(() => listener?.("\r\nconnected\r\n\x1b]633;D;0\x07\x1b]633;B\x07"));
      }
    },
    snapshot() {
      return { metadata: { shell: "/bin/bash" } };
    },
  } as unknown as TerminalSurface;
  const registry = {
    getSurface: () => surface,
  } as unknown as SurfaceRegistry;
  return { tool: createTerminalRunTool(registry, undefined, undefined, service), writes, requests };
}
const __jait_hook_689 = () => backgroundCommandMonitor.clearForTests();
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (detectInteractivePrompt("build finished successfully")));
  
})();

} finally {
await __jait_hook_689();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
