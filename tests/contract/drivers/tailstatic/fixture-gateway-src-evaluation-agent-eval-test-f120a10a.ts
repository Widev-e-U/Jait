// Translated fixture from packages/gateway/src/evaluation/agent-eval.test.ts; expected literals are in tail_static.rs.
import { execFileSync } from "node:child_process";
import { searchProject } from "../../../../packages/gateway/src/services/project-search.js";
import { mkdir } from "node:fs/promises";
import { createServer } from "node:http";
import { mkdtemp, readFile, rm, writeFile, symlink } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  judgePrompt, EventParser, suiteSchema, parseVerdict, classify, verifyTask, evaluateTask, runChat, runEvaluation,
  type EvalOptions, type EvalTask,
} from "../../../../packages/gateway/src/evaluation/agent-eval.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/evaluation/agent-eval.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_78_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = await directory();
    execFileSync("git", ["init", "--quiet"], { cwd: root });
    await writeFile(path.join(root, ".gitignore"), "runs/\n");
    const output = path.join(root, "runs"); await mkdir(output);
    const mock = gateway();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
    const result = await searchProject({ root: report.workspace, query: "fixture.json", mode: "files" }, { rgCommand: "jait-missing-rg" });
    __jait_capture(2, (result.mode === "files" && result.files.map(f => f.name)));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_88_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway(); let judges = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (new URL(String(input)).pathname === "/api/chat" && body.mode === "ask" && ++judges === 1) {
        return stream([{ type: "token", content: "Evidence reviewed.\n" + JSON.stringify(verdict) }, { type: "done" }]);
      }
      return mock.fetchImpl(input, init);
    };
    const output = await directory();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, fetchImpl));
    __jait_capture(2, (report.status)); __jait_capture(3, (judges));
    __jait_capture(4, (report.judge?.content));
    __jait_capture(5, (JSON.parse(await readFile(path.join(output, "read-evidence-1/judge-retry-trace.json"), "utf8")).content), (JSON.stringify(verdict)));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_103_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway({ ...verdict, findings: [{ severity: "warning", category: "tool_failure", message: "Invented", callIds: ["unknown"] }] });
    let judges = 0;
    const fetchImpl: typeof fetch = async (input, init) => {
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (new URL(String(input)).pathname === "/api/chat" && body.mode === "ask" && ++judges === 1) {
        return stream([{ type: "token", content: "not JSON" }, { type: "done" }]);
      }
      return mock.fetchImpl(input, init);
    };
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), fetchImpl));
    __jait_capture(2, (report.status)); __jait_capture(3, (report.error));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_116_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway("invalid verdict");
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    __jait_capture(2, (report.status));
    __jait_capture(3, (mock.bodies.filter(body => body.mode === "ask")));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_123_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const example = task();
    __jait_thrown(2, () => suiteSchema.parse({ version: 1, tasks: [example, example] }));
    for (const name of ["../escape", "/absolute", "C:/absolute", "folder/../escape", "folder\\escape"]) {
      __jait_thrown(3, () => suiteSchema.parse({ version: 1, tasks: [{ ...example, fixtures: { [name]: "bad" } }] }));
    }
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_130_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const parser = new EventParser();
    __jait_capture(2, (parser.push('data: {"ty')));
    __jait_capture(3, (parser.push('pe":"token","content":"héllo"}\r\n\r\n: keepalive\n')));
    __jait_capture(4, (parser.push('data: {"type":"done"}', true)));
    __jait_thrown(5, () => parser.push("data: not-json\n"));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_137_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const ticks = String.fromCharCode(96).repeat(3);
    __jait_capture(2, (parseVerdict(ticks + "json\n" + JSON.stringify(verdict) + "\n" + ticks).outcome));
    __jait_thrown(3, () => parseVerdict('{"outcome":"success"}'));
    __jait_thrown(4, () => parseVerdict(JSON.stringify({ ...verdict, fabricatedScore: 100 })));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_143_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const passed = [{ name: "fixture", passed: true, detail: "matches" }];
    __jait_capture(2, (classify(passed, { ...verdict, findings: [] })));
    __jait_capture(3, (classify([{ ...passed[0]!, passed: false }], { ...verdict, findings: [] })));
    __jait_capture(4, (classify(passed, { ...verdict, process: "issues", findings: [] })));
    __jait_capture(5, (classify(passed, { ...verdict, outcome: "uncertain", findings: [] })));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_150_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = await directory();
    await writeFile(path.join(output, "fixture.json"), '{"port":8080}');
    const example = task();
    example.checks.push({ type: "command", executable: process.execPath, args: ["-e", "process.exit(7)"], timeoutSeconds: 3 });
    const results = await verifyTask(example, output);
    __jait_capture(2, (results.map((result) => result.passed)));
    __jait_capture(3, (results[1]?.detail));
    await writeFile(path.join(output, "fixture.json"), '{"b":2,"a":1}');
    example.checks = [{ type: "json", path: "fixture.json", equals: { a: 1, b: 2 } }];
    __jait_capture(4, ((await verifyTask(example, output))[0]?.passed));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_162_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const output = await directory(), outside = await directory();
    await writeFile(path.join(outside, "secret"), "outside");
    await symlink(path.join(outside, "secret"), path.join(output, "fixture.json"));
    const result = await verifyTask(task(), output);
    __jait_capture(2, (result[0]?.passed)); __jait_capture(3, (result[0]?.detail));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_169_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway(), output = await directory();
    const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
    __jait_capture(2, (report.status));
    const chats = mock.bodies.filter((body) => body.provider === "jait");
    __jait_capture(3, (chats.map((body) => [body.mode, body.model])));
    __jait_capture(4, (chats[1]?.content));
    const evidence = JSON.parse(await readFile(path.join(output, "read-evidence-1/judge/evidence.json"), "utf8"));
    __jait_capture(5, (evidence.worker.events));
    __jait_capture(6, (evidence.worker.content));
    __jait_capture(7, (JSON.parse(await readFile(path.join(output, "read-evidence-1/worker-trace.json"), "utf8")).events));
    __jait_capture(8, (await readFile(path.join(output, "read-evidence-1/judge/subject/fixture.json"), "utf8")));
    __jait_capture(9, (JSON.parse(await readFile(path.join(output, "read-evidence-1/report.json"), "utf8")).status));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_183_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway({ ...verdict, process: "issues", findings: [{
      severity: "warning", category: "workaround", message: "Unexpected retry.", callIds: ["read-1"],
    }] });
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    __jait_capture(2, (report.status));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_190_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway({ ...verdict, findings: [{
      severity: "warning", category: "tool_failure", message: "Invented.", callIds: ["nonexistent"],
    }] });
    const report = await evaluateTask(task(), "read-evidence-1", options(await directory(), mock.fetchImpl));
    __jait_capture(2, (report.status)); __jait_capture(3, (report.error));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_197_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway();
    const fetchImpl: typeof fetch = async (input, init) => new URL(String(input)).pathname === "/api/chat"
      ? stream([{ type: "token", content: "unfinished" }]) : mock.fetchImpl(input, init);
    const result = await runChat(options(await directory(), fetchImpl), "/fixture", "task", "worker", "case");
    __jait_capture(2, (result.error)); __jait_capture(3, (mock.cancelled));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_204_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    for (const events of [
      [{ type: "approval_required", request_id: "approval-1" }],
      Array.from({ length: 11 }, (_, i) => ({ type: "tool_start", call_id: String(i) })),
    ]) {
      const mock = gateway();
      const fetchImpl: typeof fetch = async (input, init) => new URL(String(input)).pathname === "/api/chat"
        ? stream(events) : mock.fetchImpl(input, init);
      const result = await runChat(options(await directory(), fetchImpl), "/fixture", "task", "worker", "case");
      __jait_captureType(2, (result.error)); __jait_capture(3, (mock.cancelled));
    }
    const mock = gateway(), controller = new AbortController();
    controller.abort();
    const result = await runChat({ ...options(await directory(), mock.fetchImpl), signal: controller.signal },
      "/fixture", "task", "worker", "case");
    __jait_captureType(4, (result.error)); __jait_capture(5, (mock.bodies));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_221_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway(), settings = options(await directory(), mock.fetchImpl);
    settings.maxTraceBytes = 5;
    const report = await evaluateTask(task(), "read-evidence-1", settings);
    __jait_capture(2, (report.status)); __jait_captureType(3, (report.judge));
    __jait_capture(4, (mock.cancelled));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_228_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    let cancelled = false;
    const timeout = new AbortController();
    const timeoutSpy = vi.spyOn(AbortSignal, "timeout").mockReturnValueOnce(timeout.signal);
    const server = createServer((request, response) => {
      if (request.url === "/api/sessions") {
        response.writeHead(201, { "content-type": "application/json" });
        response.end(JSON.stringify({ id: "http-fixture" }));
      } else if (request.url === "/api/sessions/http-fixture/cancel") {
        cancelled = true;
        response.writeHead(200, { "content-type": "application/json" }); response.end("{}");
      } else {
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.write('data: {"type":"token","content":"waiting"}\n\n');
        // Keep the connection open to exercise actual fetch abort/body cancellation.
      }
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing test address");
    try {
      const settings = options(await directory(), globalThis.fetch);
      settings.gateway = "http://127.0.0.1:" + address.port;
      // Expire the timeout only after an SSE token is received, so the test
      // exercises stream cancellation instead of racing session creation.
      settings.onProgress = (progress) => {
        if (progress.event?.type === "token") timeout.abort(new DOMException("Test timeout", "TimeoutError"));
      };
      const result = await runChat(settings, "/fixture", "task", "worker", "case");
      __jait_capture(2, (timeoutSpy.mock.calls));
      __jait_capture(3, (result.error)); __jait_capture(4, (cancelled));
      __jait_capture(5, (result.content));
    } finally {
      timeoutSpy.mockRestore();
      server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_266_3": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };
/*__jait_scope_open__*/{

try {
await (async()=>{

    const mock = gateway(verdict, 2), settings = options(await directory(), mock.fetchImpl);
    settings.repeat = 3;
    const reports = await runEvaluation([task()], settings);
    __jait_capture(2, (reports));
    __jait_capture(3, (reports.map((report) => report.status)));
    __jait_capture(4, (new Set(reports.map((report) => report.workspace)).size));
    __jait_capture(5, (mock.maximum));
    const aggregate = JSON.parse(await readFile(path.join(settings.output, "report.json"), "utf8"));
    __jait_capture(6, (aggregate.model)); __jait_capture(7, (aggregate.reports));
    __jait_capture(8, (JSON.stringify(aggregate)));
  
})();

} finally {
await __jait_hook_612();
}
}

break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_280_1": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };

try {
await (async()=>{

  const events = [
    ...Array.from({ length: 1000 }, () => ({ type: "thinking", content: "private reasoning fragment" })),
    { type: "tool_call_delta", call_id: "c", args_delta: "fragment" },
    { type: "tool_start", call_id: "c", tool: "file.write", args: { content: "é\r\n" } },
    { type: "tool_result", call_id: "c", tool: "file.write", ok: false, message: "exact failure" },
    { type: "token", content: "Verified." }, { type: "done" },
  ];
  const prompt = judgePrompt(task(), { sessionId: "s", events, content: "Verified.", durationMs: 1 }, []);
  __jait_capture(2, (prompt));
  __jait_capture(3, (prompt));
  __jait_capture(4, (prompt));
  __jait_capture(5, (prompt), (JSON.stringify({ content: "é\r\n" })));
  __jait_capture(6, (prompt.length));

})();

} finally {
await __jait_hook_612();
}


break;
}
case "tailstatic_packages_gateway_src_evaluation_agent_eval_test_ts_295_1": {


const temporary: string[] = [];
async function directory() {
  const result = await mkdtemp(path.join(os.tmpdir(), "jait-eval-test-")); temporary.push(result); return result;
}
const verdict = { outcome: "pass", process: "pass", summary: "Verified.", findings: [] } as const;
function task(): EvalTask {
  return suiteSchema.parse({ version: 1, tasks: [{ id: "read-evidence", title: "Read evidence",
    prompt: "Read fixture.json and preserve its contents.", fixtures: { "fixture.json": '{"port":8080}' },
    checks: [{ type: "json", path: "fixture.json", equals: { port: 8080 } }],
    rubric: ["Confirm actual tool results."] }] }).tasks[0]!;
}
function options(output: string, fetchImpl: typeof fetch): EvalOptions {
  return { output, gateway: "http://localhost:8000", token: "fixture-token", model: "pinned-model",
    judgeModel: "pinned-judge", timeoutSeconds: 5, maxToolCalls: 10, maxTraceBytes: 100_000,
    concurrency: 2, repeat: 1, fetch: fetchImpl };
}
function stream(events: unknown[]): Response {
  return new Response(events.map((event) => "data: " + JSON.stringify(event) + "\n\n").join(""),
    { headers: { "content-type": "text/event-stream" } });
}
function gateway(judging: unknown = verdict, parallelWorkers = 1) {
  const bodies: Record<string, unknown>[] = [];
  let active = 0, maximum = 0, cancelled = 0, workers = 0;
  let releaseWorkers!: () => void;
  const workersReady = new Promise<void>((resolve) => { releaseWorkers = resolve; });
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(String(input));
    __jait_capture(0, (new Headers(init?.headers).get("authorization")));
    __jait_capture(1, (init?.redirect));
    const body = init?.body ? JSON.parse(String(init.body)) as Record<string, unknown> : {};
    bodies.push(body);
    if (url.pathname.endsWith("/cancel")) { cancelled++; return Response.json({ ok: true }); }
    if (url.pathname === "/api/sessions") {
      if (typeof body.projectPath === "string" && body.projectPath.includes("jait-eval-workspace-")) temporary.push(path.dirname(body.projectPath));
      return Response.json({ id: crypto.randomUUID() });
    }
    if (url.pathname === "/api/chat") {
      active++; maximum = Math.max(maximum, active);
      // Hold the first worker requests until the configured batch has arrived.
      // Filesystem setup speed must not decide whether requests overlap.
      if (body.mode === "agent" && ++workers <= parallelWorkers) {
        if (workers === parallelWorkers) releaseWorkers();
        let timer: ReturnType<typeof setTimeout> | undefined;
        try {
          await Promise.race([workersReady, new Promise<void>((_, reject) => {
            timer = setTimeout(() => reject(new Error("Worker concurrency barrier timed out")), 10_000);
          })]);
        } finally { clearTimeout(timer); }
      }
      active--;
      if (body.mode === "ask") return stream([{ type: "token", content: JSON.stringify(judging) }, { type: "done" }]);
      return stream([
        { type: "tool_start", tool: "file.read", call_id: "read-1", args: { path: "fixture.json" } },
        { type: "tool_result", tool: "file.read", call_id: "read-1", ok: true, data: { port: 8080 } },
        { type: "token", content: "Verified the fixture." }, { type: "done" },
      ]);
    }
    throw new Error("Unexpected endpoint " + url.pathname);
  };
  return { fetchImpl, bodies, get maximum() { return maximum; }, get cancelled() { return cancelled; } };
}
const __jait_hook_612 = async () => { await Promise.all(temporary.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))); };

try {
await (async()=>{

  const output = await directory(), mock = gateway();
  await writeFile(path.join(output, "suite.json"), "hidden-verifier");
  const report = await evaluateTask(task(), "read-evidence-1", options(output, mock.fetchImpl));
  temporary.push(path.dirname(report.workspace));
  __jait_capture(2, (report.workspace.startsWith(output + path.sep)));
  __jait_capture(3, (mock.bodies.find(body => body.mode === "agent")?.content));

})();

} finally {
await __jait_hook_612();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
