// Translated fixture from packages/gateway/src/services/orchestration/executor.test.ts; expected literals are in tail_static.rs.
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { VerificationGate } from "@jait/shared/types";
import { type JaitDB, migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { PlanService } from "../../../../packages/gateway/src/services/plans.js";
import type { RepositoryService } from "../../../../packages/gateway/src/services/repositories.js";
import { createWorkflowVerifier } from "../../../../packages/gateway/src/services/orchestration/command-verifier.js";
import {
  buildTaskPrompt,
  extractReport,
  SubAgentTaskExecutor,
  type SubAgentRunner,
  type SubAgentRunRequest,
  unboundSubAgentRunner,
} from "../../../../packages/gateway/src/services/orchestration/executor.js";
import { inertWorkspaces } from "../../../../packages/gateway/src/services/orchestration/inert-workspaces.js";
import { OrchestrationService, type TaskExecutionInput, type VerificationRunner } from "../../../../packages/gateway/src/services/orchestration/orchestrator.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/orchestration/executor.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_48_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildTaskPrompt(input());
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    __jait_capture(3, (prompt));
    __jait_capture(4, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_57_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const scoped = buildTaskPrompt(input({ claims: { reads: ["docs"], writes: ["src", "name:db"] } }));
    __jait_capture(0, (scoped));
    __jait_capture(1, (scoped));
    const readOnly = buildTaskPrompt(input({ claims: { reads: [], writes: [] } }));
    __jait_capture(2, (readOnly));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_65_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildTaskPrompt(input({ claims: { reads: [], writes: ["src"], protects: ["src/tests", "**/*.test.ts"] } }));
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
    // A task without protections still gets the general rule, but no protected-path line.
    const plain = buildTaskPrompt(input());
    __jait_capture(3, (plain));
    __jait_capture(4, (plain));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_76_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildTaskPrompt(
      input({
        dependencyResults: [
          { taskId: "B", summary: "done, token=abc123secret was rotated", changedFiles: ["src/a.ts"], artifacts: [] },
        ],
      }),
    );
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_89_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const dependencyResults = Array.from({ length: 25 }, (_, index) => ({
      taskId: `D${index}`,
      summary: "ok",
      changedFiles: [],
      artifacts: [],
    }));
    const prompt = buildTaskPrompt(input({ dependencyResults }));
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_102_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildTaskPrompt(
      input({
        attemptNo: 2,
        previousAttempt: {
          error: "verification failed: output exists",
          verification: [
            { gateId: "check", label: "output exists", required: true, passed: false, detail: "file missing" },
          ],
        },
      }),
    );
    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
    __jait_capture(2, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_121_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractReport('{"status":"completed"}')));
    __jait_capture(1, (extractReport('[INFORM] {"status":"completed"}')));
    __jait_capture(2, (extractReport('```json\n{"status":"completed"}\n```')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_127_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (extractReport("All done!")));
    __jait_capture(1, (extractReport("[1,2]")));
    __jait_capture(2, (extractReport('{"a":1} and {"b":2}')));
    const oversized = "x".repeat(300_000);
    __jait_capture(3, (extractReport(oversized)), (oversized));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_137_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const requests: SubAgentRunRequest[] = [];
    const runner: SubAgentRunner = {
      run: async (request) => {
        requests.push(request);
        return {
          text: JSON.stringify({
            taskId: request.taskId,
            attemptId: request.attemptId,
            status: "completed",
            summary: "done",
            changedFiles: [],
            artifacts: [],
            followUps: [],
          }),
        };
      },
    };
    const result = await new SubAgentTaskExecutor(runner).execute(input({ timeoutSeconds: 90 }));
    __jait_capture(0, (result));
    __jait_capture(1, (requests));
    __jait_capture(2, (requests[0]), ({ userId: USER, runId: "run-1", taskId: "A", attemptId: "att-1", timeoutMs: 90_000 }));
    __jait_capture(3, (requests[0]?.prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_170_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const runner: SubAgentRunner = {
      run: vi.fn(async () => {
        throw new Error("provider unavailable");
      }),
    };
    await __jait_rejected(0, new SubAgentTaskExecutor(runner).execute(input()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_234_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const runner: SubAgentRunner = {
      run: async (request) => ({
        text: JSON.stringify({
          taskId: request.taskId,
          attemptId: request.attemptId,
          status: "completed",
          summary: "wrote it",
          changedFiles: ["out/result.txt"],
          artifacts: [],
          followUps: [],
        }),
      }),
    };
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(runner),
      verifier: passingVerifier,
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(USER, { title: "agent run", tasks: [task] });
    await service.settle();
    __jait_capture(0, (service.getRun(USER, run.id).status));
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_259_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const runner: SubAgentRunner = { run: vi.fn(async () => ({ text: "All done!" })) };
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(runner),
      verifier: passingVerifier,
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(USER, { title: "prose", tasks: [{ ...task, maxAttempts: 2 }] });
    await service.settle();
    const view = service.getRun(USER, run.id);
    __jait_capture(0, (view.status));
    __jait_capture(1, (view.tasks[0]?.attemptCount));
    __jait_capture(2, (view.tasks[0]?.lastError));
    __jait_capture(3, (runner.run.mock.calls));
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_276_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(unboundSubAgentRunner),
      verifier: passingVerifier,
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(USER, { title: "unbound", tasks: [task] });
    await service.settle();
    const view = service.getRun(USER, run.id);
    __jait_capture(0, (view.status));
    __jait_capture(1, (view.tasks[0]?.lastError));
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_290_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const prompts = new Map<string, string>();
    const runner: SubAgentRunner = {
      run: async (request) => {
        prompts.set(request.taskId, request.prompt);
        const first = request.taskId === "A";
        return {
          text: JSON.stringify({
            taskId: request.taskId,
            attemptId: request.attemptId,
            status: "completed",
            summary: first ? "wrote out/a.txt, token=abc123secret" : "used A",
            changedFiles: first ? ["out/a.txt"] : [],
            artifacts: [],
            followUps: [],
          }),
        };
      },
    };
    const service = new OrchestrationService({
      db,
      executor: new SubAgentTaskExecutor(runner),
      verifier: passingVerifier,
      workspaces: inertWorkspaces,
    });
    const run = service.createRun(USER, {
      title: "dependency context",
      tasks: [task, { ...task, id: "B", title: "Report", dependsOn: ["A"] }],
    });
    await service.settle();
    __jait_capture(0, (service.getRun(USER, run.id).status));
    const dependent = prompts.get("B") ?? "";
    __jait_capture(1, (dependent));
    __jait_capture(2, (dependent));
    __jait_capture(3, (dependent));
    __jait_capture(4, (dependent));
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_328_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const dir = await mkdtemp(join(__jait_fixture_dir, "jait-artifact-"));
    try {
      const service = new OrchestrationService({
        db,
        executor: new SubAgentTaskExecutor({
          run: async (request) => {
            await mkdir(join(dir, "out"), { recursive: true });
            await writeFile(join(dir, "out", "result.txt"), "findings\n");
            return {
              text: JSON.stringify({
                taskId: request.taskId,
                attemptId: request.attemptId,
                status: "completed",
                summary: "wrote the findings",
                changedFiles: ["out/result.txt"],
                artifacts: [],
                followUps: [],
              }),
            };
          },
        }),
        verifier: createWorkflowVerifier({ repositories: repositoryAt(dir), toolExecutor: undefined }),
        workspaces: workspaceAt(dir),
      });
      const run = service.createRun(USER, { planId: writerPlanId(db) });
      await service.settle();
      __jait_capture(0, (service.getRun(USER, run.id).status));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_orchestration_executor_test_ts_361_3": {


const USER = "user-1";
function gate(): VerificationGate {
  return { id: "check", label: "output exists", check: { kind: "artifact", path: "out/result.txt" } };
}
function input(overrides: Partial<TaskExecutionInput> = {}): TaskExecutionInput {
  return {
    runId: "run-1",
    taskId: "A",
    attemptId: "att-1",
    attemptNo: 1,
    userId: USER,
    title: "Write the report",
    description: "Summarise the findings in out/result.txt.",
    claims: { reads: [], writes: ["."] },
    verification: [gate()],
    dependencyResults: [],
    previousAttempt: null,
    timeoutSeconds: 120,
    signal: new AbortController().signal,
    ...overrides,
  };
}
function repositoryAt(dir: string): Pick<RepositoryService, "getById"> {
  return {
    getById: (id: string) => (id === "repo-1" ? { id, userId: USER, localPath: dir, deviceId: null } : undefined),
  } as unknown as Pick<RepositoryService, "getById">;
}
function workspaceAt(dir: string) {
  return {
    ...inertWorkspaces,
    prepareRead: async () => ({ path: dir, branch: "inert" }),
    prepareWrite: async () => ({ path: dir, branch: "inert" }),
  };
}
function writerPlanId(db: JaitDB): string {
  return new PlanService(db).create({
    repoId: "repo-1",
    userId: USER,
    title: "Research note",
    tasks: [
      {
        id: "A",
        title: "Write the report",
        description: "Write out/result.txt.",
        status: "approved",
        dependsOn: [],
        resources: { writes: ["out"] },
        verification: [gate()],
      },
    ],
  }).id;
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
let db: JaitDB;
const passingVerifier: VerificationRunner = { run: async () => ({ passed: true, detail: "ok" }) };
const task = { id: "A", title: "Write", description: "", dependsOn: [], verification: [gate()] };
const __jait_hook_8667 = async () => {
    const opened = await openDatabase(":memory:");
    sqlite = opened.sqlite;
    db = opened.db;
    migrateDatabase(sqlite);
  };
const __jait_hook_8829 = () => {
    sqlite.close();
  };
await __jait_hook_8667();
try {
await (async()=>{

    const dir = await mkdtemp(join(__jait_fixture_dir, "jait-artifact-"));
    try {
      const service = new OrchestrationService({
        db,
        executor: new SubAgentTaskExecutor({
          run: async (request) => ({
            text: JSON.stringify({
              taskId: request.taskId,
              attemptId: request.attemptId,
              status: "completed",
              summary: "wrote the findings",
              changedFiles: ["out/result.txt"],
              artifacts: [],
              followUps: [],
            }),
          }),
        }),
        verifier: createWorkflowVerifier({ repositories: repositoryAt(dir), toolExecutor: undefined }),
        workspaces: workspaceAt(dir),
      });
      const run = service.createRun(USER, { planId: writerPlanId(db) });
      await service.settle();
      const view = service.getRun(USER, run.id);
      __jait_capture(0, (view.status));
      __jait_capture(1, (view.tasks[0]?.lastError));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  
})();

} finally {
await __jait_hook_8829();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
