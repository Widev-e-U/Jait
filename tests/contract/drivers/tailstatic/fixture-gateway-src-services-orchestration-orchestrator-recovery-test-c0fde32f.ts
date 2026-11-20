// Translated fixture from packages/gateway/src/services/orchestration/orchestrator-recovery.test.ts; expected literals are in tail_static.rs.
import type { VerificationGate } from "@jait/shared/types";
import { type JaitDB, migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { AgentHaltedError } from "../../../../packages/gateway/src/services/agent-control.js";
import { inertWorkspaces } from "../../../../packages/gateway/src/services/orchestration/inert-workspaces.js";
import {
  OrchestrationConflictError,
  OrchestrationNotFoundError,
  OrchestrationService,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
  workflowSessionId,
} from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/orchestrator-recovery.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_94_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "halt", tasks: [task("A", { maxAttempts: 3 })] });
    await flush();
    __jait_capture(0, (attempts));

    halted.add(USER);
    __jait_capture(1, (service.stopForUser(USER).stopped));
    const halted1 = service.getRun(USER, run.id);
    __jait_capture(2, (stateOf(halted1, "A")));
    __jait_capture(3, (halted1.status));
    __jait_capture(4, (halted1.paused));
    __jait_thrown(5, () => service.createRun(USER, { title: "new", tasks: [task("X")] }), (AgentHaltedError));
    __jait_thrown(6, () => service.resumeRun(USER, run.id, [retry("A")]), (AgentHaltedError));

    // Unhalted, but the stopped executor is still running: resume must wait for it.
    halted.delete(USER);
    __jait_thrown(7, () => service.resumeRun(USER, run.id, [retry("A")]), (OrchestrationConflictError));
    attempts[0]?.resolve(report(attempts[0].input));
    await flush();

    service.resumeRun(USER, run.id, [retry("A")]);
    await flush();
    __jait_capture(8, (attempts));
    __jait_capture(9, (attempts[1]?.input.attemptNo));
    attempts[1]?.resolve(report(attempts[1].input));
    await service.settle();
    __jait_capture(10, (service.getRun(USER, run.id).status));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_127_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "cancel", tasks: [task("A"), task("B", { dependsOn: ["A"] })] });
    await flush();
    const cancelled = service.cancelRun(USER, run.id, "operator stop");
    __jait_capture(0, (attempts[0]?.input.signal.aborted));
    __jait_capture(1, (cancelled.status));
    __jait_capture(2, (stateOf(cancelled, "A")));
    __jait_capture(3, (stateOf(cancelled, "B")));

    attempts[0]?.resolve(report(attempts[0].input));
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(4, (final.status));
    __jait_capture(5, (stateOf(final, "A")));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_147_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const crashed = holdingExecutor();
    const before = makeService(crashed.executor);
    const run = before.createRun(USER, { title: "restart", tasks: [task("A"), task("B", { dependsOn: ["A"] })] });
    await flush();
    __jait_capture(0, (crashed.attempts));

    const executed: TaskExecutionInput[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        executed.push(input);
        return report(input);
      },
    };
    const after = makeService(executor);
    __jait_capture(1, (after.recoverAfterRestart()));
    const recovered = after.getRun(USER, run.id);
    __jait_capture(2, (recovered.status));
    __jait_capture(3, (recovered.paused));
    __jait_capture(4, (stateOf(recovered, "A")));
    __jait_capture(5, (stateOf(recovered, "B")));
    __jait_thrown(6, () => after.resumeRun(USER, run.id), (OrchestrationConflictError));
    await after.settle();
    __jait_capture(7, (executed));

    after.resumeRun(USER, run.id, [{ taskId: "A", decision: "retry", note: "workspace reviewed" }]);
    await after.settle();
    __jait_capture(8, (executed.map((input) => input.taskId)));
    __jait_capture(9, (executed[0]?.attemptNo));
    __jait_capture(10, (after.getRun(USER, run.id).status));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_179_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const crashed = holdingExecutor();
    const before = makeService(crashed.executor);
    const run = before.createRun(USER, { title: "late", tasks: [task("A")] });
    const after = makeService({ execute: async (input) => report(input) });
    after.recoverAfterRestart();

    crashed.attempts[0]?.resolve(report(crashed.attempts[0].input));
    await before.settle();
    const view = after.getRun(USER, run.id);
    __jait_capture(0, (stateOf(view, "A")));
    __jait_capture(1, (view.status));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_195_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const executor: TaskExecutor = {
      execute: vi.fn(
        (input: TaskExecutionInput) =>
          new Promise((_resolve, reject) => {
            input.signal.addEventListener("abort", () => reject(new Error("aborted")));
          }),
      ),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "timeout",
      tasks: [task("A", { timeoutSeconds: 1, maxAttempts: 3 })],
    });
    await new Promise((resolve) => setTimeout(resolve, 1200));
    await service.settle();
    __jait_capture(0, (executor.execute.mock.calls));
    const view = service.getRun(USER, run.id);
    __jait_capture(1, (stateOf(view, "A")));
    __jait_capture(2, (view.tasks[0]?.lastError));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_219_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const { executor } = holdingExecutor();
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "mine", tasks: [task("A")] });
    __jait_thrown(0, () => service.getRun("someone-else", run.id), (OrchestrationNotFoundError));
    __jait_thrown(1, () => service.cancelRun("someone-else", run.id), (OrchestrationNotFoundError));
    __jait_capture(2, (service.listRuns("someone-else")));
    // A worker session belongs to its run's owner, so only that owner can answer its prompts.
    __jait_capture(3, (service.ownerOfWorkflowSession(workflowSessionId(run.id))), (USER));
    __jait_captureType(4, (service.ownerOfWorkflowSession("workflow:")));
    __jait_captureType(5, (service.ownerOfWorkflowSession("workflow:no-such-run")));
    __jait_captureType(6, (service.ownerOfWorkflowSession("chat-session-1")));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_recovery_test_ts_233_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
let halted: Set<string>;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function task(id: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { id, title: `Task ${id}`, description: "", dependsOn: [], verification: [gate()], ...extra };
}
function report(input: TaskExecutionInput, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    taskId: input.taskId,
    attemptId: input.attemptId,
    status: "completed",
    summary: `${input.taskId} done`,
    changedFiles: [],
    artifacts: [],
    followUps: [],
    ...extra,
  };
}
function retry(taskId: string) {
  return { taskId, decision: "retry" as const, note: "workspace checked" };
}
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, extra: { globalMaxWorkers?: number } = {}): OrchestrationService {
  return new OrchestrationService({
    db,
    executor,
    verifier: passingVerifier,
    workspaces: inertWorkspaces,
    isHalted: (userId) => halted.has(userId),
    ...extra,
  });
}
function holdingExecutor() {
  const attempts: Array<{ input: TaskExecutionInput; resolve: (value: unknown) => void }> = [];
  const executor: TaskExecutor = {
    execute: (input) =>
      new Promise((resolve) => {
        attempts.push({ input, resolve });
      }),
  };
  return { executor, attempts };
}
function flush(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}
const __jait_hook_707 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  halted = new Set();
};
const __jait_hook_879 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_707();
try {
await (async()=>{

    const { executor, attempts } = holdingExecutor();
    const service = makeService(executor, { globalMaxWorkers: 1 });
    service.createRun(USER, { title: "one", tasks: [task("A")] });
    service.createRun(USER, { title: "two", tasks: [task("B")] });
    await flush();
    __jait_capture(0, (attempts));

    attempts[0]?.resolve(report(attempts[0].input));
    await flush();
    __jait_capture(1, (attempts));
    attempts[1]?.resolve(report(attempts[1].input));
    await service.settle();
    __jait_capture(2, (service.listRuns(USER).map((run) => run.status)));
  
})();

} finally {
await __jait_hook_879();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
