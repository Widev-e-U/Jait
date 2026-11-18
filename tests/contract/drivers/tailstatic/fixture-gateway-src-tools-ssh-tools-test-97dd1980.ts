// Translated fixture from packages/gateway/src/tools/ssh-tools.test.ts; expected literals are in tail_static.rs.
import type { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { SecretInputService } from "../../../../packages/gateway/src/services/secret-input.js";
import { UserSecretService } from "../../../../packages/gateway/src/services/user-secrets.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { buildToolSchemas } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { createToolRegistry } from "../../../../packages/gateway/src/tools/index.js";
import {
  createSshRunTool,
  createSshSessionCloseTool,
  createSshSessionRunTool,
  createSshSessionStartTool,
  type SshPtyFactory,
} from "../../../../packages/gateway/src/tools/ssh-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/ssh-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_109_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, requests, secret } = autoSubmitSecret();
    const { factory } = fakePtyFactory();
    const registry = new ToolRegistry();
    registry.register(createSshRunTool(service, factory));
    const chunks: string[] = [];
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "ssh.run",
      {
        host: "linux-box.local",
        username: "alice",
        command: "printf codex-remote",
        authMethod: "password",
        strictHostKeyChecking: false,
      },
      context({ providerId: "codex", requestedBy: "agent", onOutputChunk: (chunk) => chunks.push(chunk) }),
      audit,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((result.data as { output: string }).output));
    __jait_capture(2, (JSON.stringify(result.data)), (secret));
    __jait_capture(3, (chunks.join("")), (secret));
    __jait_capture(4, (requests));
    __jait_capture(5, (JSON.stringify(auditEntries)), (secret));
    __jait_capture(6, (auditEntries[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_153_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userSecrets = new UserSecretService(db, "test-secret");
    userSecrets.save({
      userId: "user-1",
      type: "ssh-password",
      key: "alice@linux-box.local:22",
      label: "SSH password for alice@linux-box.local",
      value: "remembered-password",
    });
    const secretInput = new SecretInputService({
      onRequest: () => {
        throw new Error("should not request a password when a saved secret exists");
      },
    });
    const { factory, ptys } = fakePtyFactory();
    const tool = createSshRunTool(secretInput, factory, userSecrets);

    const result = await tool.execute({
      host: "linux-box.local",
      username: "alice",
      command: "printf codex-remote",
      authMethod: "password",
      strictHostKeyChecking: false,
    }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (ptys[0]?.writes.some((write) => write.includes("remembered-password"))));
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_242_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, requests, secret } = autoSubmitSecret("super-secret-sudo");
    const { factory, ptys, spawns } = fakeSudoPtyFactory();
    const registry = new ToolRegistry();
    registry.register(createSshRunTool(service, factory));
    const chunks: string[] = [];
    const auditEntries: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        auditEntries.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute(
      "ssh.run",
      {
        host: "linux-box.local",
        username: "alice",
        command: "apt-get install -y cups",
        sudo: true,
        strictHostKeyChecking: false,
      },
      context({ providerId: "codex", requestedBy: "agent", onOutputChunk: (chunk) => chunks.push(chunk) }),
      audit,
    );

    __jait_capture(0, (result.ok));
    const output = (result.data as { output: string }).output;
    __jait_capture(1, (output));
    if (process.platform !== "win32") {
      __jait_capture(2, (spawns[0]?.command));
      __jait_capture(3, (spawns[0]?.args.slice(0, 2)));
    }
    __jait_capture(4, (output));
    __jait_capture(5, (output), (secret));
    __jait_capture(6, (chunks.join("")), (secret));
    __jait_capture(7, (requests));
    // The password was fed to the remote sudo prompt over the PTY...
    __jait_capture(8, (ptys[0]?.writes.some((write) => write.includes(secret))));
    // ...but never appears in tool inputs or audit output.
    __jait_capture(9, (JSON.stringify(auditEntries)), (secret));
    __jait_capture(10, (auditEntries[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_294_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const userSecrets = new UserSecretService(db, "test-secret");
    userSecrets.save({
      userId: "user-1",
      type: "ssh-sudo-password",
      key: "alice@linux-box.local:22",
      label: "sudo password for alice@linux-box.local",
      value: "remembered-sudo-pw",
    });
    const secretInput = new SecretInputService({
      onRequest: () => {
        throw new Error("should not request a sudo password when a saved secret exists");
      },
    });
    const { factory, ptys } = fakeSudoPtyFactory();
    const tool = createSshRunTool(secretInput, factory, userSecrets);

    const result = await tool.execute({
      host: "linux-box.local",
      username: "alice",
      command: "systemctl enable --now cups",
      sudo: true,
      strictHostKeyChecking: false,
    }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (ptys[0]?.writes.some((write) => write.includes("remembered-sudo-pw"))));
    sqlite.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_328_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const tools = createToolRegistry(new SurfaceRegistry(), {
      secretInputService: new SecretInputService(),
    });

    const schemas = buildToolSchemas(tools);
    const byName = new Map(schemas.map((schema) => [schema.function.name, schema]));

    __jait_capture(0, (byName.has("ssh_run")));
    __jait_capture(1, (byName.has("ssh_session_start")));
    __jait_capture(2, (byName.has("ssh_session_run")));
    __jait_capture(3, (byName.has("ssh_session_close")));
    __jait_capture(4, (byName.get("ssh_run")?.function.parameters));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_ssh_tools_test_ts_345_3": {


function context(overrides: Partial<Parameters<ReturnType<typeof createSshRunTool>["execute"]>[1]> = {}) {
  return {
    sessionId: "ssh-test-session",
    actionId: "ssh-test-action",
    projectRoot: process.cwd(),
    requestedBy: "agent",
    userId: "user-1",
    providerId: "codex",
    model: "gpt-5-codex",
    ...overrides,
  };
}
function autoSubmitSecret(secret = "remote-password") {
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
class FakePty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];

  constructor(private readonly args: string[]) {
    queueMicrotask(() => this.emitData("Password: "));
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    const remoteCommand = this.args[this.args.length - 1] ?? "";
    if (remoteCommand === "printf codex-remote") {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData("codex-remote\n");
      this.emitExit(0);
      return;
    }
    const readyMarker = data.match(/(__JAIT_SSH_READY_[A-Za-z0-9_]+)/)?.[1];
    if (readyMarker) {
      this.emitData(`${readyMarker}\n`);
      return;
    }
    const doneMarker = data.match(/(__JAIT_SSH_DONE_[A-Za-z0-9_]+__)/)?.[1];
    if (doneMarker) {
      const command = data.split("\n")[0] ?? "";
      this.emitData(`${command}\n/stateful-directory\n${doneMarker}:0\n`);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakePtyFactory() {
  const ptys: FakePty[] = [];
  const factory: SshPtyFactory = (_command, args) => {
    const pty = new FakePty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys };
}
class FakeSudoPty {
  readonly writes: string[] = [];
  private dataListeners: Array<(data: string) => void> = [];
  private exitListeners: Array<(event: { exitCode: number; signal?: number }) => void> = [];
  private readonly marker: string | null;

  constructor(args: string[]) {
    const remoteCommand = args[args.length - 1] ?? "";
    this.marker = remoteCommand.match(/-p '([^']+)'/)?.[1] ?? null;
    queueMicrotask(() => { if (this.marker) this.emitData(this.marker); });
  }

  onData(cb: (data: string) => void): void {
    this.dataListeners.push(cb);
  }

  onExit(cb: (event: { exitCode: number; signal?: number }) => void): void {
    this.exitListeners.push(cb);
  }

  write(data: string): void {
    this.writes.push(data);
    // The marker is the sudo prompt; the only line we expect back is the password.
    if (this.marker && data.trim() && this.marker !== data.trim()) {
      this.emitData(`${data.trim()}\r\n`);
      this.emitData(`\n${this.marker}apt-sudo-ok\n`);
      this.emitExit(0);
    }
  }

  kill(): void {
    this.emitExit(143);
  }

  private emitData(data: string): void {
    for (const listener of this.dataListeners) listener(data);
  }

  private emitExit(exitCode: number): void {
    for (const listener of this.exitListeners) listener({ exitCode });
  }
}
function fakeSudoPtyFactory() {
  const ptys: FakeSudoPty[] = [];
  const spawns: Array<{ command: string; args: string[] }> = [];
  const factory: SshPtyFactory = (command, args) => {
    spawns.push({ command, args });
    const pty = new FakeSudoPty(args);
    ptys.push(pty);
    return pty;
  };
  return { factory, ptys, spawns };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service } = autoSubmitSecret();
    const { factory, ptys } = fakePtyFactory();
    const startTool = createSshSessionStartTool(service, factory);
    const runTool = createSshSessionRunTool();
    const closeTool = createSshSessionCloseTool();

    const startPromise = startTool.execute({
      host: "linux-box.local",
      username: "alice",
      authMethod: "password",
      strictHostKeyChecking: false,
    }, context({ providerId: "jait" }));
    const started = await startPromise;

    __jait_capture(0, (started.ok));
    const sshSessionId = (started.data as { sshSessionId: string }).sshSessionId;
    __jait_capture(1, (sshSessionId));
    __jait_capture(2, (ptys[0]?.writes.some((write) => write.includes("remote-password"))));

    const ran = await runTool.execute({
      sshSessionId,
      command: "pwd",
    }, context({ providerId: "jait" }));

    __jait_capture(3, (ran.ok));
    __jait_capture(4, ((ran.data as { output: string }).output));

    const closed = await closeTool.execute({ sshSessionId }, context({ providerId: "jait" }));
    __jait_capture(5, (closed.ok));
  
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
