// Translated fixture from packages/gateway/src/services/chat-loops.test.ts; expected literals are in tail_static.rs.
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ChatLoopService, chatLoopInstructions } from "../../../../packages/gateway/src/services/chat-loops.js";
import * as systemOne from "../../../../packages/gateway/src/services/system-one.js";
import { backgroundCommandMonitor } from "../../../../packages/gateway/src/services/background-command-monitor.js";
import { createLoopTools } from "../../../../packages/gateway/src/tools/loop-tools.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/chat-loops.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_24_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const inspect = vi.spyOn(backgroundCommandMonitor, "inspectExecution");
    const goal = loops.goal(sessionId, "Repair", ["Tests pass"]);
    const input = { revision: goal.revision, outcome: "complete" as const, summary: "Tests pass",
      evidence: ["Test execution passed"], executionRefs: [{ criterion: 0, terminalId: "terminal", executionId: "run" }] };
    inspect.mockReturnValueOnce(null);
    await __jait_rejected(0, loops.checkMonitored(sessionId, input));
    __jait_capture(1, (inspect.mock.calls), ([sessionId,"terminal","run"]));
    inspect.mockReturnValueOnce({ terminalId: "terminal", executionId: "run", status: "failed", exitCode: 101, output: "compile failed", durationMs: 1 });
    await __jait_rejected(2, loops.checkMonitored(sessionId, input));
    __jait_capture(3, (loops.get(sessionId)?.status));
    inspect.mockReturnValueOnce({ terminalId: "terminal", executionId: "run", status: "completed", exitCode: 0, output: "ok", durationMs: 1 });
    const result = await loops.checkMonitored(sessionId, input);
    __jait_capture(4, (result.executionEvidence));
    __jait_capture(5, (result.status));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_41_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const goal = loops.goal(sessionId, "Repair", ["Tests pass"], undefined, [0]);
    await __jait_rejected(0, loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Tests passed"] }));
    __jait_capture(1, (loops.get(sessionId)?.status));
    __jait_thrown(2, () => loops.goal(sessionId, "Repair", ["Tests pass"], undefined, [1]));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_48_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const goal = loops.goal(sessionId, "Repair", ["Tests pass"]);
    await __jait_rejected(0, loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "continue", summary: "Trying",
      nextMessage: "Check", executionRefs: [{ criterion: 1, terminalId: "t", executionId: "e" }] }));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_54_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const wake = vi.fn();
    loops.onWake = wake;
    const goal = loops.goal(sessionId, "Fix the issue", ["Regression test passes"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "continue", summary: "Reproduced", nextMessage: "Implement the fix and rerun the test" });
    __jait_capture(0, (loops.finishTurn(sessionId)));
    const restarted = new ChatLoopService(sessions);
    __jait_capture(1, (restarted.running()));
    __jait_capture(2, (restarted.get(sessionId)));
    __jait_capture(3, (JSON.parse(sessions.getById(sessionId)!.metadata!).chat.model));
    __jait_capture(4, (restarted.finishTurn(sessionId)?.nextMessage));
    __jait_capture(5, (wake.mock.calls), ([sessionId]));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_68_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    __jait_thrown(0, () => loops.goal(sessionId, " ", ["Pass"]));
    const goal = loops.goal(sessionId, "Fix", ["Regression passes", "Build passes"]);
    __jait_thrown(1, () => loops.check(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Regression passes"] }));
    __jait_capture(2, (loops.get(sessionId)?.status));
    __jait_capture(3, (loops.check(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Test command exit 0", "Build command exit 0"] }).status));
    __jait_capture(4, (loops.running()));
    __jait_thrown(5, () => loops.control(sessionId, "resume"));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_78_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const first = loops.goal(sessionId, "First", ["Pass"]);
    loops.control(sessionId, "pause");
    __jait_capture(0, (loops.finishTurn(sessionId)?.status));
    loops.control(sessionId, "resume");
    __jait_thrown(1, () => loops.check(sessionId, { revision: first.revision, outcome: "complete", summary: "Stale", evidence: ["old"] }));
    const next = loops.goal(sessionId, "Second", ["New evidence"]);
    __jait_capture(2, (next.id), (first.id));
    // Replacing a goal also needs a fresh revision, even at the same iteration.
    __jait_thrown(3, () => loops.check(sessionId, { revision: first.revision, outcome: "complete", summary: "Stale", evidence: ["old"] }));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_90_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    loops.goal(sessionId, "Fix", ["Pass"]);
    __jait_capture(0, (loops.finishTurn(sessionId, undefined, true)?.status));
    loops.control(sessionId, "resume");
    __jait_capture(1, (loops.finishTurn(sessionId, "Provider failed")?.status));
    const goal = loops.control(sessionId, "resume");
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target is authorized?" });
    __jait_capture(2, (loops.finishTurn(sessionId)?.status));
    __jait_capture(3, (chatLoopInstructions(loops.get(sessionId))));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_101_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    __jait_captureType(0, (chatLoopInstructions(null)));
    loops.goal(sessionId, "Finish migration", ["All components verified"]);
    loops.finishTurn(sessionId, "Workspace is out of credits");
    const instructions = chatLoopInstructions(loops.get(sessionId))!;
    __jait_capture(1, (instructions));
    __jait_capture(2, (instructions));
    __jait_capture(3, (instructions));
    __jait_capture(4, (instructions));
    __jait_capture(5, (instructions));
    __jait_capture(6, (loops.running()));
    loops.control(sessionId, "pause");
    __jait_capture(7, (chatLoopInstructions(loops.get(sessionId))));
    const resumed = loops.control(sessionId, "resume");
    __jait_capture(8, (chatLoopInstructions(resumed)));
    loops.check(sessionId, { revision: resumed.revision, outcome: "complete", summary: "Verified", evidence: ["All checks passed"] });
    __jait_captureType(9, (chatLoopInstructions(loops.get(sessionId))));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_120_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    loops.check(sessionId, { revision: goal.revision, outcome: "waiting", summary: "Which target?" });
    __jait_capture(0, (loops.resumeAfterAnswer(sessionId, "question-1")));
    __jait_capture(1, (loops.get(sessionId)?.nextMessage));
    loops.control(sessionId, "pause");
    __jait_capture(2, (loops.resumeAfterAnswer(sessionId, "question-2")?.status));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_129_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const user = sessions.create({ userId: "fork-owner", name: "Original" });
    loops.goal(user.id, "Fix", ["Pass"], "fork-owner");
    const branch = sessions.fork(user.id, { userId: "fork-owner" })!;
    __jait_captureType(0, (loops.get(branch.id)));
    __jait_capture(1, (loops.get(user.id)?.status));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_137_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const goal = createLoopTools(loops).find(tool => tool.name === "loop.goal")!;
    const context = { sessionId, actionId: "test", projectRoot: ".", requestedBy: "test" };
    __jait_capture(0, ((await goal.execute({ goal: "Fix", criteria: ["Pass"] }, context)).ok));
    __jait_capture(1, ((await goal.execute({ goal: "Fix", criteria: ["Pass"] }, { ...context, userId: "owner", threadId: "different-thread" })).ok));
    __jait_captureType(2, (loops.get(sessionId)));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_152_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false));
    const goal = loops.goal(sessionId, "Fix", ["Regression passes"]);
    const input = { revision: goal.revision, outcome: "complete" as const, summary: "Tested", evidence: ["Regression test exit 0"] };
    const rejected = await loops.checkMonitored(sessionId, input, undefined, keys);
    __jait_capture(0, (rejected), ({ status: "running", monitor: { status: "rejected", criteriaPassed: [false], reviewedRevision: goal.revision } }));
    __jait_capture(1, (rejected.nextMessage));
    evaluate.mockResolvedValue(verdict());
    const completed = await loops.checkMonitored(sessionId, { ...input, revision: rejected.revision }, undefined, keys);
    __jait_capture(2, (completed));
    __jait_capture(3, (evaluate.mock.calls[0][1]));
    __jait_capture(4, (evaluate.mock.calls[0][1]));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_166_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const result = verdict();
    result.answers.criterion_0.confidence = 0.5;
    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(result);
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    __jait_capture(0, (await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys)));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_175_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    vi.spyOn(systemOne, "evaluateDecision").mockRejectedValue(new Error("private endpoint credentials"));
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys);
    __jait_capture(0, (result));
    __jait_capture(1, (JSON.stringify(result)));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_183_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    let resolve!: (value: ReturnType<typeof verdict>) => void;
    vi.spyOn(systemOne, "evaluateDecision").mockImplementation(() => new Promise(r => { resolve = r; }));
    for (const action of ["pause", "replace"] as const) {
      const goal = loops.goal(sessionId, "Fix", ["Pass"]);
      const pending = loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] }, undefined, keys);
      if (action === "pause") loops.control(sessionId, "pause");
      else loops.goal(sessionId, "Different goal", ["Different check"]);
      resolve(verdict());
      await __jait_rejected(0, pending);
      __jait_capture(1, (loops.get(sessionId)?.status), (action === "pause" ? "paused" : "running"));
      __jait_captureType(2, (loops.get(sessionId)?.monitor));
    }
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_198_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false, false));
    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 3; i++) {
      const goal = loops.get(sessionId)!;
      await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "continue", summary: `Attempt ${i}`, nextMessage: "Inspect failure" }, undefined, keys);
      loops.finishTurn(sessionId);
    }
    __jait_capture(0, (loops.get(sessionId)));
    __jait_capture(1, (loops.control(sessionId, "resume")));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_210_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 3; i++) loops.finishTurn(sessionId);
    __jait_capture(0, (loops.get(sessionId)?.summary));
    loops.control(sessionId, "resume");
    for (let i = 0; i < 50; i++) {
      const goal = loops.get(sessionId)!;
      loops.check(sessionId, { revision: goal.revision, outcome: "continue", summary: `Progress ${i}`, nextMessage: "Next" });
      loops.finishTurn(sessionId);
    }
    __jait_capture(1, (loops.get(sessionId)));
    __jait_capture(2, (loops.get(sessionId)?.summary));
    __jait_capture(3, (loops.get(sessionId)?.summary));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_225_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    const user = sessions.create({ userId: "owner", name: "Tool chat" });
    const goal = loops.goal(user.id, "Fix", ["Pass"], "owner");
    const tool = createLoopTools(loops).find(t => t.name === "loop.check")!;
    const result = await tool.execute({ revision: goal.revision, outcome: "complete", summary: "Tested", evidence: ["exit 0"] },
      { sessionId: user.id, userId: "owner", actionId: "test", projectRoot: ".", requestedBy: "test" });
    __jait_capture(0, (result));
    const waiting = loops.goal(sessionId, "Fix", ["Pass"]);
    __jait_capture(1, (await loops.checkMonitored(sessionId, { revision: waiting.revision, outcome: "waiting", summary: "Need user answer" }, undefined, keys)));
    __jait_capture(2, (evaluate.mock.calls));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_238_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict());
    const goal = loops.goal(sessionId, "Fix", ["Pass"]);
    await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete",
      summary: "Bearer other-secret https://user:password@example.com",
      evidence: ["Test passed; test-key"] }, undefined, keys);
    const state = evaluate.mock.calls[0][1];
    __jait_capture(0, (state));
    __jait_capture(1, (state));
    __jait_capture(2, (state));
    __jait_capture(3, (state));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_251_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision");
    const goal = loops.goal(sessionId, "Fix", Array.from({ length: 20 }, () => "x".repeat(2000)));
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete",
      summary: "Done", evidence: Array.from({ length: 20 }, () => "Reported test passed") }, undefined, keys);
    __jait_capture(0, (result));
    __jait_capture(1, (evaluate.mock.calls));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_260_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false, false));
    loops.goal(sessionId, "Fix", ["Pass"]);
    for (let i = 0; i < 2; i++) {
      const goal = loops.get(sessionId)!;
      await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "continue", summary: `Attempt ${i}`, nextMessage: "Verify" }, undefined, keys);
      loops.finishTurn(sessionId);
    }
    vi.mocked(systemOne.evaluateDecision).mockResolvedValue(verdict(true, false));
    const goal = loops.get(sessionId)!;
    const completed = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Test exit 0"] }, undefined, keys);
    __jait_capture(0, (completed.status));
    __jait_capture(1, (loops.finishTurn(sessionId)?.status));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_275_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict(false));
    const user = sessions.create({ userId: "owner", name: "Monitored tool chat" });
    const goal = loops.goal(user.id, "Fix", ["Pass"], "owner");
    const tool = createLoopTools(loops).find(t => t.name === "loop.check")!;
    const result = await tool.execute({ revision: goal.revision, outcome: "complete", summary: "Done", evidence: ["Test exit 0"] },
      { sessionId: user.id, userId: "owner", actionId: "test", projectRoot: ".", requestedBy: "test", apiKeys: keys });
    __jait_capture(0, (result));
    __jait_capture(1, (evaluate.mock.calls));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_chat_loops_test_ts_286_3": {


/*__jait_scope_open__*/{
let sessions: SessionService;
let loops: ChatLoopService;
let sessionId: string;
let close: () => void;
const keys = { SYSTEM_ONE_API_KEY: "test-key" };
function verdict(passed = true, progress = true) {
    return { model: "monitor-test", answers: {
      progress: { type: "choice" as const, choice: progress ? "progress" : "stalled", confidence: 0.95 },
      criterion_0: { type: "choice" as const, choice: passed ? "passed" : "unverified", confidence: 0.95 },
    } };
  }
const __jait_hook_601 = async () => {
    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    close = () => sqlite.close();
    sessions = new SessionService(db);
    sessionId = sessions.create({ name: "Goal", metadata: { chat: { model: "saved" } } }).id;
    loops = new ChatLoopService(sessions);
  };
const __jait_hook_932 = () => { vi.restoreAllMocks(); close(); };
await __jait_hook_601();
try {
await (async()=>{

    const evaluate = vi.spyOn(systemOne, "evaluateDecision").mockResolvedValue(verdict());
    const goal = loops.goal(sessionId, "Fix", ["Tests pass", "Build passes"]);
    const result = await loops.checkMonitored(sessionId, { revision: goal.revision, outcome: "complete", summary: "Verified", evidence: ["Tests exit 0", "Build exit 0"] }, undefined, keys);
    __jait_capture(0, (result));
    __jait_capture(1, (evaluate.mock.calls[0][2]));
  
})();

} finally {
await __jait_hook_932();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
