// Translated fixture from packages/gateway/src/services/orchestration/orchestrator.test.ts; expected literals are in tail_static.rs.
import type { VerificationGate } from "@jait/shared/types";
import { type JaitDB, migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { PlanService } from "../../../../packages/gateway/src/services/plans.js";
import { inertWorkspaces } from "../../../../packages/gateway/src/services/orchestration/inert-workspaces.js";
import {
  OrchestrationService,
  OrchestrationValidationError,
  type TaskExecutionInput,
  type TaskExecutor,
  type VerificationRunner,
} from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { OrchestrationStore } from "../../../../packages/gateway/src/services/orchestration/store.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/orchestrator.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_63_1": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
await __jait_hook_669();
try {
await (async()=>{

  let active!: TaskExecutionInput;
  let complete!: () => void;
  const service = makeService({
    async execute(input) {
      active = input;
      input.recordAgentRef!("worker-from-runner");
      await new Promise<void>((resolve) => { complete = resolve; });
      return report(input);
    },
  });
  const run = service.createRun(USER, { title: "worker identity", tasks: [task("A")] });
  await vi.waitFor(() => __jait_captureType(0, (complete)));
  const view = service.cancelRun(USER, run.id);
  __jait_capture(1, (view.tasks[0]));
  __jait_capture(2, (new OrchestrationStore(db).getAttempts(run.id)[0]));
  __jait_thrown(3, () => active.recordAgentRef!("late-worker"));
  complete();
  await service.settle();

})();

} finally {
await __jait_hook_819();
}


break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_87_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const events: string[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        events.push(`start:${input.taskId}`);
        await Promise.resolve();
        events.push(`end:${input.taskId}`);
        return report(input);
      },
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "fan-in",
      maxWorkers: 2,
      tasks: [
        task("A"),
        task("B", { dependsOn: ["A"] }),
        task("C", { dependsOn: ["A"] }),
        task("D", { dependsOn: ["B", "C"] }),
      ],
    });
    await service.settle();
    __jait_capture(0, (service.getRun(USER, run.id).status));
    __jait_capture(1, (events.indexOf("start:B")), (events.indexOf("end:A")));
    __jait_capture(2, (events.indexOf("start:D")), (events.indexOf("end:B")));
    __jait_capture(3, (events.indexOf("start:D")), (events.indexOf("end:C")));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_115_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const executed: string[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        executed.push(input.taskId);
        return input.taskId === "B" ? report(input, { status: "failed", error: "compile error" }) : report(input);
      },
    };
    const service = makeService(executor);
    const run = service.createRun(USER, {
      title: "branch failure",
      tasks: [
        task("A"),
        task("B", { dependsOn: ["A"], maxAttempts: 1 }),
        task("C", { dependsOn: ["A"] }),
        task("D", { dependsOn: ["B", "C"] }),
      ],
    });
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(0, (final.status));
    __jait_capture(1, (stateOf(final, "B")));
    __jait_capture(2, (stateOf(final, "C")));
    __jait_capture(3, (stateOf(final, "D")));
    __jait_capture(4, (executed));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_144_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const executor: TaskExecutor = {
      execute: vi.fn(async (input: TaskExecutionInput) => report(input, { status: "failed", error: "nope" })),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "budget", tasks: [task("A", { maxAttempts: 2 })] });
    await service.settle();
    __jait_capture(0, (executor.execute.mock.calls));
    const final = service.getRun(USER, run.id);
    __jait_capture(1, (stateOf(final, "A")));
    __jait_capture(2, (final.tasks[0]?.attemptCount));
    __jait_capture(3, (final.status));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_158_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    let verdicts = 0;
    const verifier: VerificationRunner = {
      run: async () => {
        verdicts += 1;
        return verdicts === 1 ? { passed: false, detail: "file missing" } : { passed: true, detail: "ok" };
      },
    };
    const inputs: TaskExecutionInput[] = [];
    const executor: TaskExecutor = {
      execute: async (input) => {
        inputs.push(input);
        return report(input);
      },
    };
    const service = makeService(executor, verifier);
    const run = service.createRun(USER, { title: "repair", tasks: [task("A", { maxAttempts: 2 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(0, (final.status));
    __jait_capture(1, (inputs));
    __jait_capture(2, (inputs[1]?.previousAttempt?.error));
    __jait_capture(3, (inputs[1]?.previousAttempt?.verification));
    // Scope, the plan's gate and integration are all recorded, and all of them passed.
    __jait_capture(4, (final.tasks[0]?.verification));
    __jait_capture(5, (final.tasks[0]?.verification?.every((outcome) => outcome.passed)));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_188_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const verifier: VerificationRunner = { run: vi.fn(async () => ({ passed: true, detail: "ok" })) };
    const executor: TaskExecutor = {
      execute: async (input) => ({ ...report(input), verified: true }),
    };
    const service = makeService(executor, verifier);
    const run = service.createRun(USER, { title: "invalid", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(0, (stateOf(final, "A")));
    __jait_capture(1, (final.status));
    __jait_capture(2, (verifier.run.mock.calls));
    __jait_capture(3, (final.tasks[0]?.lastError));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_203_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const executor: TaskExecutor = { execute: async (input) => report(input) };
    const service = new OrchestrationService({ db, executor, workspaces: inertWorkspaces });
    const run = service.createRun(USER, { title: "closed", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(0, (final.status));
    __jait_capture(1, (final.tasks[0]?.verification?.map((outcome) => outcome.detail).join("\n")));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_213_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    let failing = true;
    const executor: TaskExecutor = {
      execute: async (input) => report(input, failing ? { status: "failed", error: "boom" } : {}),
    };
    const service = makeService(executor);
    const run = service.createRun(USER, { title: "retry", tasks: [task("A", { maxAttempts: 1 })] });
    await service.settle();
    __jait_capture(0, (service.getRun(USER, run.id).status));
    failing = false;
    service.retryTask(USER, run.id, "A");
    await service.settle();
    const final = service.getRun(USER, run.id);
    __jait_capture(1, (final.status));
    __jait_capture(2, (final.tasks[0]?.attemptCount));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_232_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const executor: TaskExecutor = { execute: vi.fn(async (input: TaskExecutionInput) => report(input)) };
    const service = makeService(executor);
    let thrown: unknown;
    try {
      service.createRun(USER, {
        title: "cycle",
        tasks: [task("A", { dependsOn: ["B"] }), task("B", { dependsOn: ["A"] })],
      });
    } catch (error) {
      thrown = error;
    }
    __jait_instance(0, thrown, OrchestrationValidationError);
    __jait_capture(1, ((thrown as OrchestrationValidationError).issues.map((issue) => issue.code)));
    __jait_capture(2, (service.listRuns(USER)));
    __jait_capture(3, (executor.execute.mock.calls));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_250_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const plans = new PlanService(db);
    const plan = plans.create({
      repoId: "repo-1",
      userId: USER,
      title: "Agent proposal",
      tasks: [
        { id: "A", title: "Task A", description: "", status: "approved", verification: [gate()] },
        { id: "B", title: "Task B", description: "", status: "proposed", verification: [gate()] },
        { id: "C", title: "Task C", description: "", status: "skipped", verification: [gate()] },
      ],
    });
    const executor: TaskExecutor = { execute: vi.fn(async (input: TaskExecutionInput) => report(input)) };
    const service = makeService(executor);
    let thrown: unknown;
    try {
      service.createRun(USER, { planId: plan.id });
    } catch (error) {
      thrown = error;
    }
    __jait_instance(0, thrown, OrchestrationValidationError);
    const issues = (thrown as OrchestrationValidationError).issues;
    __jait_capture(1, (issues.map((issue) => issue.code)));
    __jait_capture(2, (issues.map((issue) => issue.taskId)));
    __jait_capture(3, (service.listRuns(USER)));
    __jait_capture(4, (executor.execute.mock.calls));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_278_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const plans = new PlanService(db);
    const plan = plans.create({
      repoId: "repo-1",
      userId: USER,
      title: "Plan",
      tasks: [{ id: "A", title: "Task A", description: "", status: "approved", verification: [gate()] }],
    });
    const executor: TaskExecutor = { execute: async (input) => report(input, { summary: `result of ${input.runId}` }) };
    const service = makeService(executor);

    const first = service.createRun(USER, { planId: plan.id });
    await service.settle();
    const second = service.createRun(USER, { planId: plan.id });
    await service.settle();

    __jait_capture(0, (second.id), (first.id));
    __jait_capture(1, (service.listRuns(USER).map((run) => run.id).sort()), ([first.id, second.id].sort()));
    for (const run of [first, second]) {
      const view = service.getRun(USER, run.id);
      __jait_capture(2, (view.planId), (plan.id));
      __jait_capture(3, (view.status));
      __jait_capture(4, (view.tasks[0]?.result?.summary), (`result of ${run.id}`));
    }
    const firstAttempts = service.getTaskAttempts(USER, first.id, "A");
    const secondAttempts = service.getTaskAttempts(USER, second.id, "A");
    __jait_capture(5, (firstAttempts));
    __jait_capture(6, (secondAttempts));
    __jait_capture(7, (firstAttempts[0]?.id), (secondAttempts[0]?.id));
    __jait_capture(8, (firstAttempts[0]?.result?.summary), (`result of ${first.id}`));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_orchestrator_test_ts_310_3": {


const USER = "user-1";
let sqlite: SqliteDatabase;
let db: JaitDB;
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
function stateOf(view: { tasks: Array<{ taskId: string; state: string }> }, taskId: string): string | undefined {
  return view.tasks.find((item) => item.taskId === taskId)?.state;
}
function makeService(executor: TaskExecutor, verifier: VerificationRunner = passingVerifier): OrchestrationService {
  return new OrchestrationService({ db, executor, verifier, workspaces: inertWorkspaces });
}
const __jait_hook_669 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_819 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_669();
try {
await (async()=>{

    const plans = new PlanService(db);
    const plan = plans.create({
      repoId: "repo-1",
      userId: USER,
      title: "Plan",
      tasks: [{ id: "A", title: "Task A", description: "", status: "approved", verification: [gate()] }],
    });
    const executor: TaskExecutor = { execute: async (input) => report(input) };
    const service = makeService(executor);
    const run = service.createRun(USER, { planId: plan.id });
    plans.update(plan.id, {
      title: "Edited",
      tasks: [{ id: "Z", title: "Other", description: "", status: "approved", verification: [gate()] }],
    });
    await service.settle();
    const view = service.getRun(USER, run.id);
    __jait_capture(0, (view.planId), (plan.id));
    __jait_capture(1, (view.title));
    __jait_capture(2, (view.tasks.map((item) => item.taskId)));
    __jait_capture(3, (view.status));
  
})();

} finally {
await __jait_hook_819();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
