// Translated fixture from packages/gateway/src/services/database-retention.test.ts; expected literals are in tail_static.rs.
import type { Database } from "bun:sqlite";
import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/index.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import {
  DatabaseRetentionService,
  loadDatabaseRetentionPolicy,
  type DatabaseRetentionPolicy,
} from "../../../../packages/gateway/src/services/database-retention.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/database-retention.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_63_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    const contextFlow = JSON.stringify({
      provider: "jait",
      rounds: [{ round: 1, messages: [{ role: "user", content: "x".repeat(600_000) }] }],
    });
    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-dry", "session-dry", "assistant", "unchanged", contextFlow, OLD);

    const service = new DatabaseRetentionService(sqlite, policy());
    const report = await service.runOnce({ dryRun: true, now: NOW });

    __jait_capture(0, (report.candidates.oversizedContextFlows.rows));
    __jait_capture(1, (report.processed.contextFlowsCompacted));
    const row = sqlite.prepare(
      "SELECT context_flow AS contextFlow FROM messages WHERE id = ?",
    ).get("message-dry") as { contextFlow: string };
    __jait_capture(2, (row.contextFlow), (contextFlow));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_85_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    const insertSession = sqlite.prepare(
      `INSERT INTO sessions (id, created_at, last_active_at, status, viewed_at)
       VALUES (?, ?, ?, 'active', ?)`,
    );
    insertSession.run("session-stale", OLD, OLD, null);
    insertSession.run("session-fresh", RECENT, RECENT, null);
    insertSession.run("session-viewed", OLD, OLD, RECENT); // recently opened even though inactive
    insertSession.run("session-running", OLD, OLD, null);
    sqlite.prepare(
      `UPDATE agent_threads SET session_id = ? WHERE id = ?`,
    ).run("session-running", runningThreadId);

    const service = new DatabaseRetentionService(sqlite, policy());
    const dryRun = await service.runOnce({ dryRun: true, now: NOW });
    __jait_capture(0, (dryRun.candidates.staleSessions.rows));
    __jait_capture(1, (dryRun.processed.staleSessionsArchived));

    const report = await service.runOnce({ dryRun: false, now: NOW });
    __jait_capture(2, (report.processed.staleSessionsArchived));
    const status = (id: string): string =>
      (sqlite.prepare(`SELECT status FROM sessions WHERE id = ?`).get(id) as { status: string })
        .status;
    __jait_capture(3, (status("session-stale")));
    __jait_capture(4, (status("session-fresh")));
    __jait_capture(5, (status("session-viewed")));
    __jait_capture(6, (status("session-running")));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_114_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    const service = new DatabaseRetentionService(sqlite, policy());
    const inspect = vi.spyOn(service, "inspect").mockImplementation(() => {
      throw new Error("automatic retention must not run full aggregate scans");
    });

    const report = await service.runOnce({ dryRun: false, maxBatches: 1, now: NOW });

    __jait_capture(0, (inspect.mock.calls));
    __jait_capture(1, (report.dryRun));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_126_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    const contextFlow = JSON.stringify({
      provider: "jait",
      rounds: [],
      padding: "x".repeat(9 * 1024 * 1024),
    });
    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-very-large", "session-large", "assistant", "unchanged", contextFlow, OLD);

    const service = new DatabaseRetentionService(sqlite, policy({ searchIndexCleanupEnabled: false }));
    await service.runOnce({ dryRun: false, maxBatches: 1, now: NOW });

    const row = sqlite.prepare(
      "SELECT context_flow AS contextFlow FROM messages WHERE id = ?",
    ).get("message-very-large") as { contextFlow: string };
    __jait_capture(0, (JSON.parse(row.contextFlow)), ({
      provider: "unknown",
      rounds: [],
      retentionCompacted: true,
      truncatedBytes: Buffer.byteLength(contextFlow, "utf8"),
    }));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_152_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    const contextFlow = JSON.stringify({
      provider: "jait",
      model: "test-model",
      rounds: [{
        round: 1,
        createdAt: OLD,
        messages: [{ role: "user", content: "x".repeat(600_000) }],
        metrics: { completionTokens: 42 },
      }],
      memory: { injectedIds: ["memory-1"] },
    });
    const toolCalls = JSON.stringify([{
      callId: "call-1",
      tool: "terminal.run",
      args: { command: "echo ok", padding: "a".repeat(100_000) },
      ok: true,
      message: "done",
      data: { output: "b".repeat(600_000) },
      startedAt: 1,
      completedAt: 2,
      retryCount: 1,
    }]);

    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, tool_calls, segments, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "message-old",
      "session-old",
      "assistant",
      "searchable retained message",
      toolCalls,
      JSON.stringify([{ type: "text", content: "segment stays" }]),
      contextFlow,
      OLD,
    );
    sqlite.prepare(
      `INSERT INTO message_context_metadata (message_id, has_memory_provenance)
       VALUES (?, 1)`,
    ).run("message-old");

    sqlite.prepare(
      `INSERT INTO messages
       (id, session_id, role, content, context_flow, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run("message-recent", "session-recent", "assistant", "recent content", contextFlow, RECENT);

    const insertActivity = sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    insertActivity.run(
      "transient-old",
      completedThreadId,
      "codex/event/exec_command_output_delta",
      "old stream chunk",
      JSON.stringify({ delta: "x".repeat(10_000) }),
      OLD,
    );
    insertActivity.run(
      "transient-running",
      runningThreadId,
      "thinking",
      "active stream chunk",
      JSON.stringify({ delta: "keep" }),
      OLD,
    );
    insertActivity.run(
      "unknown-old",
      completedThreadId,
      "future/meaningful.delta",
      "unknown kind remains",
      JSON.stringify({ data: "y".repeat(600_000) }),
      OLD,
    );
    insertActivity.run(
      "durable-old",
      completedThreadId,
      "tool.result",
      "result " + "z".repeat(20_000),
      JSON.stringify({ data: "z".repeat(600_000) }),
      OLD,
    );

    sqlite.prepare(
      `INSERT INTO audit_log
       (id, timestamp, action_id, action_type, tool_name, inputs, outputs, side_effects, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      "audit-old",
      OLD,
      "action-old",
      "tool_call",
      "terminal.run",
      JSON.stringify({ command: "x".repeat(10_000) }),
      JSON.stringify({ output: "y".repeat(10_000) }),
      JSON.stringify({ changed: true }),
      "executed",
    );

    const service = new DatabaseRetentionService(sqlite, policy());
    const report = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });

    __jait_capture(0, (report.errors));
    __jait_capture(1, (report.processed.contextFlowsCompacted));
    __jait_capture(2, (report.processed.toolCallsCompacted));
    __jait_capture(3, (report.processed.transientActivitiesDeleted));
    __jait_capture(4, (report.processed.auditPayloadsCleared));

    const message = sqlite.prepare(
      `SELECT role, content, segments, context_flow AS contextFlow, tool_calls AS toolCalls
       FROM messages WHERE id = ?`,
    ).get("message-old") as {
      role: string;
      content: string;
      segments: string;
      contextFlow: string;
      toolCalls: string;
    };
    __jait_capture(5, (message), ({
      role: "assistant",
      content: "searchable retained message",
      segments: JSON.stringify([{ type: "text", content: "segment stays" }]),
    }));
    __jait_capture(6, (JSON.parse(message.contextFlow)));
    const retainedCalls = JSON.parse(message.toolCalls) as Array<Record<string, unknown>>;
    __jait_capture(7, (Array.isArray(retainedCalls)));
    __jait_capture(8, (retainedCalls[0]));
    __jait_capture(9, (Buffer.byteLength(message.toolCalls, "utf8")));

    __jait_capture(10, (sqlite.prepare(
      "SELECT has_memory_provenance AS value FROM message_context_metadata WHERE message_id = ?",
    ).get("message-old")));
    __jait_capture(11, (sqlite.prepare(
      "SELECT COUNT(*) AS count FROM messages_fts WHERE messages_fts MATCH 'searchable'",
    ).get()));

    __jait_captureType(12, (sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'transient-old'",
    ).get() ?? undefined));
    __jait_capture(13, (sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'transient-running'",
    ).get()));
    __jait_capture(14, (sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'unknown-old'",
    ).get()));
    const durable = sqlite.prepare(
      "SELECT summary, payload FROM agent_thread_activities WHERE id = 'durable-old'",
    ).get() as { summary: string; payload: string };
    __jait_capture(15, (Buffer.byteLength(durable.summary, "utf8")));
    __jait_capture(16, (Buffer.byteLength(durable.payload, "utf8")));

    __jait_capture(17, (sqlite.prepare(
      "SELECT action_id AS actionId, inputs, outputs, side_effects AS sideEffects FROM audit_log WHERE id = ?",
    ).get("audit-old")));

    const second = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    __jait_capture(18, (Object.values(second.processed).every((count) => count === 0)));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_333_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "known-transient",
      completedThreadId,
      "thinking",
      "old thinking",
      JSON.stringify({ delta: "remove" }),
      OLD,
    );
    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "unknown-transient-looking",
      completedThreadId,
      "vendor/new_chunk",
      "unknown stays",
      JSON.stringify({ delta: "keep" }),
      OLD,
    );

    const service = new DatabaseRetentionService(sqlite, policy());
    const first = service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    const overlapping = await service.runOnce({ dryRun: false, maxBatches: 100, now: NOW });
    await first;

    __jait_capture(0, (overlapping.skippedReason));
    __jait_capture(1, (sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'unknown-transient-looking'",
    ).get()));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_370_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    sqlite.prepare(
      `INSERT INTO agent_thread_activities
       (id, thread_id, kind, summary, payload, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    ).run(
      "legacy-index-noise",
      completedThreadId,
      "context_flow",
      "legacy searchable noise",
      JSON.stringify({ marker: "legacyftspollution" }),
      OLD,
    );
    sqlite.exec(`
      INSERT INTO agent_thread_activities_fts(
        rowid, body, kind, thread_id, activity_id, created_at
      )
      SELECT rowid, summary || ' ' || payload, kind, thread_id, id, created_at
      FROM agent_thread_activities
      WHERE id = 'legacy-index-noise'
    `);

    const service = new DatabaseRetentionService(sqlite, policy({
      enabled: false,
      searchIndexCleanupEnabled: true,
    }));
    const report = await service.runOnce({ dryRun: false, maxBatches: 10, now: NOW });

    __jait_capture(0, (report.processed.searchIndexRowsRemoved));
    __jait_capture(1, (sqlite.prepare(
      "SELECT id FROM agent_thread_activities WHERE id = 'legacy-index-noise'",
    ).get()));
    __jait_captureType(2, (sqlite.prepare(
      "SELECT rowid FROM agent_thread_activities_fts WHERE activity_id = 'legacy-index-noise'",
    ).get() ?? undefined));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_407_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    __jait_capture(0, (loadDatabaseRetentionPolicy({})));
    __jait_capture(1, (loadDatabaseRetentionPolicy({
      JAIT_RETENTION_ENABLED: "true",
      JAIT_RETENTION_AUDIT_ROW_DAYS: "365",
      JAIT_RETENTION_CONTEXT_FLOW_DAYS: "0",
    })));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_database_retention_test_ts_428_3": {


const NOW = new Date("2026-08-11T12:00:00.000Z");
const OLD = "2026-01-01T00:00:00.000Z";
const RECENT = "2026-08-10T00:00:00.000Z";
function policy(overrides: Partial<DatabaseRetentionPolicy> = {}): DatabaseRetentionPolicy {
  return {
    enabled: true,
    searchIndexCleanupEnabled: true,
    contextFlowDays: 90,
    toolDetailDays: 90,
    transientActivityDays: 14,
    auditPayloadDays: 90,
    auditRowDays: null,
    staleSessionDays: 30,
    batchSize: 1,
    maxBatchesPerRun: 100,
    initialDelayMs: 10,
    intervalMs: 100,
    ...overrides,
  };
}
/*__jait_scope_open__*/{
let db: JaitDB;
let sqlite: Database;
let completedThreadId: string;
let runningThreadId: string;
const __jait_hook_1096 = async () => {
    const opened = await openDatabase(":memory:");
    db = opened.db;
    sqlite = opened.sqlite;
    migrateDatabase(sqlite);

    const threads = new ThreadService(db);
    completedThreadId = threads.create({
      title: "Completed",
      providerId: "codex",
    }).id;
    runningThreadId = threads.create({
      title: "Running",
      providerId: "codex",
    }).id;
    threads.update(completedThreadId, { status: "completed" });
    threads.update(runningThreadId, { status: "running" });
  };
const __jait_hook_1632 = () => {
    vi.useRealTimers();
    sqlite.close();
  };
await __jait_hook_1096();
try {
await (async()=>{

    vi.useFakeTimers();
    const service = new DatabaseRetentionService(sqlite, policy());

    __jait_capture(0, (service.start()));
    __jait_capture(1, (service.start()));
    service.stop();
    __jait_capture(2, (vi.getTimerCount()));
  
})();

} finally {
await __jait_hook_1632();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
