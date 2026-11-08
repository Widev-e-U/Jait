// Translated fixture from packages/gateway/src/services/disk-janitor.test.ts; expected literals are in tail_static.rs.
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, utimesSync, chmodSync } from "node:fs";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Database } from "bun:sqlite";
import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import {
  DiskJanitor,
  measureTree,
  isInside,
  loadDiskJanitorPolicy,
  type DiskJanitorPolicy,
} from "../../../../packages/gateway/src/services/disk-janitor.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/disk-janitor.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_128_3_each0": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
/*__jait_scope_open__*/{
const withSuccess = false;
await __jait_hook_2163();
try {
await (async()=>{

    const blocked = join(worktreeRoot, "repo", "jait-blocked");
    makeAgedDir(blocked, 10 * DAY_MS, 4096);
    gitStub.cleanupWorktreeWithOptions = async () => {
      throw new Error("EACCES: permission denied " + blocked);
    };
    if (withSuccess) makeAgedDir(join(tempRoot, "jait-success"), 10 * DAY_MS, 2048);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const instance = new DiskJanitor(sqlite, policy(), logger, gitStub as never, {
      worktrees: worktreeRoot, temp: tempRoot, sandboxStorage: sandboxRoot,
    });
    const run = instance.run.bind(instance);
    let pass: ReturnType<typeof run> | undefined;
    vi.spyOn(instance, "run").mockImplementation((options) => {
      pass = run(options);
      return pass;
    });
    vi.useFakeTimers();
    instance.start();
    try {
      await vi.advanceTimersByTimeAsync(10);
      const report = await pass!;
      __jait_capture(0, (report.errors));
      __jait_capture(1, (report.bytesReclaimed), (withSuccess ? 2048 : 0));
      __jait_capture(2, (existsSync(blocked)));
      __jait_capture(3, (logger.warn.mock.calls), ([blocked]));
      __jait_capture(4, (logger.error.mock.calls));
      __jait_capture(5, (logger.info.mock.calls), (withSuccess ? 1 : 0));
      await vi.advanceTimersByTimeAsync(1000);
      await pass!;
      __jait_capture(6, (logger.warn.mock.calls));
    } finally {
      instance.stop();
    }
  
})();

} finally {
await __jait_hook_2897();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_128_3_each1": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
/*__jait_scope_open__*/{
const withSuccess = true;
await __jait_hook_2163();
try {
await (async()=>{

    const blocked = join(worktreeRoot, "repo", "jait-blocked");
    makeAgedDir(blocked, 10 * DAY_MS, 4096);
    gitStub.cleanupWorktreeWithOptions = async () => {
      throw new Error("EACCES: permission denied " + blocked);
    };
    if (withSuccess) makeAgedDir(join(tempRoot, "jait-success"), 10 * DAY_MS, 2048);
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const instance = new DiskJanitor(sqlite, policy(), logger, gitStub as never, {
      worktrees: worktreeRoot, temp: tempRoot, sandboxStorage: sandboxRoot,
    });
    const run = instance.run.bind(instance);
    let pass: ReturnType<typeof run> | undefined;
    vi.spyOn(instance, "run").mockImplementation((options) => {
      pass = run(options);
      return pass;
    });
    vi.useFakeTimers();
    instance.start();
    try {
      await vi.advanceTimersByTimeAsync(10);
      const report = await pass!;
      __jait_capture(0, (report.errors));
      __jait_capture(1, (report.bytesReclaimed), (withSuccess ? 2048 : 0));
      __jait_capture(2, (existsSync(blocked)));
      __jait_capture(3, (logger.warn.mock.calls), ([blocked]));
      __jait_capture(4, (logger.error.mock.calls));
      __jait_capture(5, (logger.info.mock.calls), (withSuccess ? 1 : 0));
      await vi.advanceTimersByTimeAsync(1000);
      await pass!;
      __jait_capture(6, (logger.warn.mock.calls));
    } finally {
      instance.stop();
    }
  
})();

} finally {
await __jait_hook_2897();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_164_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
/*__jait_source_gate__ skipIf process.platform === "win32" || process.getuid?.() === 0 */
await __jait_hook_2163();
try {
await (async()=>{

      const blocked = join(tempRoot, "jait-permission");
      makeAgedDir(blocked, 10 * DAY_MS, 4096);
      chmodSync(blocked, 0o555);
      const instance = janitor();
      try {
        const failed = await instance.run({ now: NOW });
        __jait_capture(0, (failed.errors.join(" ")));
        __jait_capture(1, (failed.bytesReclaimed));
        __jait_capture(2, (failed.tempScratch));
        __jait_capture(3, (existsSync(blocked)));
      } finally {
        chmodSync(blocked, 0o755);
      }
      const recovered = await instance.run({ now: NOW });
      __jait_capture(4, (recovered.errors));
      __jait_capture(5, (recovered.bytesReclaimed));
      __jait_capture(6, (existsSync(blocked)));
    
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_187_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const nested = join(root, "nested", "child");
    mkdirSync(nested, { recursive: true });
    const file = join(nested, "payload");
    writeFileSync(file, "hello");
    __jait_capture(0, ((await measureTree(join(root, "nested"))).bytes));
    __jait_capture(1, ((await measureTree(file)).bytes));
    __jait_capture(2, (await measureTree(join(root, "missing"))));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_197_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
/*__jait_source_gate__ skipIf process.platform === "win32" || !process.getuid */
await __jait_hook_2163();
try {
await (async()=>{

    const blocked = join(tempRoot, "jait-foreign");
    makeAgedDir(blocked, 10 * DAY_MS);
    chmodSync(tempRoot, 0o1777);
    vi.spyOn(process, "getuid").mockReturnValue(process.getuid!() + 1);
    const notify = vi.fn();
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const instance = new DiskJanitor(sqlite, policy(), logger, gitStub as never, {
      worktrees: worktreeRoot, temp: tempRoot, sandboxStorage: sandboxRoot,
    }, notify);
    const first = await instance.run({ now: NOW });
    await instance.run({ now: NOW });
    __jait_capture(0, (first.blockedForeignOwned));
    __jait_capture(1, (existsSync(blocked)));
    __jait_capture(2, (notify.mock.calls));
    __jait_capture(3, (notify.mock.calls));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_215_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-aaa");
    makeAgedDir(path, 10 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
      branch: "jait/aaa",
    });

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (report.worktrees[0]?.reason));
    __jait_capture(2, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_232_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-live");
    makeAgedDir(path, 30 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "running",
      updatedAt: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
    });

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_247_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-fresh");
    makeAgedDir(path, 1 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 1 * DAY_MS).toISOString(),
    });

    const report = await janitor({ worktreeGraceMs: 2 * DAY_MS }).run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_262_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-orphan");
    makeAgedDir(path, 5 * DAY_MS);

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (report.worktrees[0]?.reason));
    __jait_capture(2, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_273_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    // Created eagerly on first execution and never removed, so every project
    // ever run leaves one behind; it sits at the level the worktree scan treats
    // as a repo dir, which is why it used to accumulate forever.
    const container = join(worktreeRoot, "jait-execution-e2e-fixture");
    mkdirSync(container, { recursive: true });
    agePath(container, 10 * DAY_MS);

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (report.worktrees[0]?.path), (container));
    __jait_capture(2, (report.worktrees[0]?.reason));
    __jait_capture(3, (existsSync(container)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_289_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const container = join(worktreeRoot, "repo");
    const path = join(container, "jait-live");
    makeAgedDir(path, 30 * DAY_MS);
    agePath(container, 30 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "running",
      updatedAt: new Date(NOW.getTime() - 30 * DAY_MS).toISOString(),
    });

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (existsSync(container)));
    __jait_capture(2, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_307_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-branch");
    makeAgedDir(path, 10 * DAY_MS);
    seedThread({
      workingDirectory: path,
      status: "error",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
      branch: "jait/branch",
    });

    await janitor({ preserveBranches: true }).run({ now: NOW });

    __jait_capture(0, (cleanupCalls[0]?.preserveBranch));
    __jait_capture(1, (cleanupCalls[0]?.branch));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_323_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-win");
    makeAgedDir(path, 10 * DAY_MS);
    // Thread was created on Windows; the stored path does not match this host.
    seedThread({
      workingDirectory: "C:\\Users\\jakob\\.jait\\worktrees\\repo\\jait-win",
      status: "completed",
      updatedAt: new Date(NOW.getTime() - 10 * DAY_MS).toISOString(),
    });

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.worktrees));
    __jait_capture(1, (report.worktrees[0]?.reason));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_339_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-dry");
    makeAgedDir(path, 10 * DAY_MS, 4096);

    const report = await janitor().inspect(NOW);

    __jait_capture(0, (report.dryRun));
    __jait_capture(1, (report.worktrees));
    __jait_capture(2, (report.bytesReclaimed));
    __jait_capture(3, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_351_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const path = join(worktreeRoot, "repo", "jait-off");
    makeAgedDir(path, 30 * DAY_MS);

    const report = await janitor({ enabled: false }).run({ now: NOW });

    __jait_capture(0, (report.skippedReason));
    __jait_capture(1, (existsSync(path)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_361_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    __jait_capture(0, (isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees/repo/a")));
    __jait_capture(1, (isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees")));
    __jait_capture(2, (isInside("/home/u/.jait/worktrees", "/home/u/projects/real-repo")));
    __jait_capture(3, (isInside("/home/u/.jait/worktrees", "/home/u/.jait/worktrees/../../secrets")));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_370_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    __jait_capture(0, (loadDiskJanitorPolicy({}).enabled));
    __jait_capture(1, (loadDiskJanitorPolicy({ JAIT_DISK_JANITOR_ENABLED: "false" }).enabled));

  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_375_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const stale = join(tempRoot, "jait-stale");
    const unrelated = join(tempRoot, "unrelated");
    makeAgedDir(stale, 4 * DAY_MS, 4096);
    makeAgedDir(unrelated, 4 * DAY_MS, 4096);

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.tempScratch));
    __jait_capture(1, (report.tempScratch[0]?.path), (stale));
    __jait_capture(2, (existsSync(stale)));
    __jait_capture(3, (existsSync(unrelated)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_389_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    const stale = join(sandboxRoot, "stale-vm");
    makeAgedDir(stale, 2 * DAY_MS, 2048);

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.sandboxStorage));
    __jait_capture(1, (report.sandboxStorage[0]?.path), (stale));
    __jait_capture(2, (existsSync(stale)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_400_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
await __jait_hook_2163();
try {
await (async()=>{

    // A directory's own mtime only moves when direct children change, so a
    // long-lived run writing deep into the tree keeps an ancient top-level
    // mtime. Reaping on that alone would delete live work.
    const live = join(tempRoot, "jait-long-run");
    makeAgedDir(live, 10 * DAY_MS, 512);
    const nested = join(live, "nested");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "active.log"), "still writing\n");

    const report = await janitor().run({ now: NOW });

    __jait_capture(0, (report.tempScratch));
    __jait_capture(1, (existsSync(live)));
  
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_disk_janitor_test_ts_416_3": {


const NOW = new Date("2026-08-20T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1_000;
function policy(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitorPolicy {
  return {
    enabled: true,
    worktreeGraceMs: 2 * DAY_MS,
    orphanWorktreeGraceMs: DAY_MS,
    preserveBranches: true,
    tempScratchMaxAgeMs: 3 * DAY_MS,
    sandboxStorageMaxAgeMs: DAY_MS,
    initialDelayMs: 10,
    intervalMs: 1_000,
    ...overrides,
  };
}
function makeAgedDir(path: string, ageMs: number, bytes = 128): void {
  mkdirSync(path, { recursive: true });
  const payload = join(path, "payload.bin");
  writeFileSync(payload, Buffer.alloc(bytes));
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
  // The age gate reads the newest mtime in the tree, so the file must be aged
  // too — otherwise every fixture looks like it was written seconds ago.
  utimesSync(payload, seconds, seconds);
}
function agePath(path: string, ageMs: number): void {
  const seconds = (NOW.getTime() - ageMs) / 1_000;
  utimesSync(path, seconds, seconds);
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let root: string;
let worktreeRoot: string;
let tempRoot: string;
let sandboxRoot: string;
let cleanupCalls: Array<{ path: string; preserveBranch?: boolean; branch?: string | null }>;
let gitStub: { cleanupWorktreeWithOptions: (p: string, o?: never) => Promise<void> };
function janitor(overrides: Partial<DiskJanitorPolicy> = {}): DiskJanitor {
    return new DiskJanitor(sqlite, policy(overrides), {
      info: () => {},
      warn: () => {},
      error: () => {},
    }, gitStub as never, {
      worktrees: worktreeRoot,
      temp: tempRoot,
      sandboxStorage: sandboxRoot,
    });
  }
function seedThread(params: {
    workingDirectory: string;
    status: string;
    updatedAt: string;
    branch?: string;
  }): string {
    const threads = new ThreadService(db);
    const thread = threads.create({ title: "t", providerId: "codex" });
    sqlite
      .prepare(
        "UPDATE agent_threads SET working_directory = ?, status = ?, updated_at = ?, branch = ? WHERE id = ?",
      )
      .run(
        params.workingDirectory,
        params.status,
        params.updatedAt,
        params.branch ?? null,
        thread.id,
      );
    return thread.id;
  }
const __jait_hook_2163 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    root = mkdtempSync(join(__jait_fixture_dir, "janitor-test-"));
    worktreeRoot = join(root, "worktrees");
    mkdirSync(worktreeRoot, { recursive: true });
    tempRoot = join(root, "temp");
    sandboxRoot = join(root, "sandbox");
    mkdirSync(tempRoot, { recursive: true });
    mkdirSync(sandboxRoot, { recursive: true });

    cleanupCalls = [];
    gitStub = {
      cleanupWorktreeWithOptions: async (path: string, options?: never) => {
        cleanupCalls.push({ path, ...(options ?? {}) });
        await rm(path, { recursive: true, force: true });
      },
    };

  };
const __jait_hook_2897 = async () => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    sqlite.close();
    await rm(root, { recursive: true, force: true });
  };
/*__jait_source_gate__ skipIf process.platform === "win32" || process.getuid?.() === 0 */
await __jait_hook_2163();
try {
await (async()=>{

      const blocked = join(tempRoot, "jait-blocked-notify");
      makeAgedDir(blocked, 10 * DAY_MS, 4096);
      chmodSync(blocked, 0o555);
      const notify = vi.fn();
      const instance = new DiskJanitor(
        sqlite,
        policy(),
        { info: () => {}, warn: () => {}, error: () => {} },
        gitStub as never,
        { worktrees: worktreeRoot, temp: tempRoot, sandboxStorage: sandboxRoot },
        notify,
      );
      try {
        await instance.run({ now: NOW });
        __jait_capture(0, (notify.mock.calls));
        __jait_capture(1, (notify.mock.calls[0]?.[0]));
        __jait_capture(2, (String(notify.mock.calls[0]?.[1])));

        // A later pass hits the same blocked directory; the user must not be
        // re-notified for an unchanged condition.
        await instance.run({ now: NOW });
        __jait_capture(3, (notify.mock.calls));
      } finally {
        chmodSync(blocked, 0o755);
      }
    
})();

} finally {
await __jait_hook_2897();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
