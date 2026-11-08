// Translated fixture from packages/gateway/src/services/provider-usage.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { NotificationService } from "../../../../packages/gateway/src/services/notifications.js";
import { providerUsage } from "../../../../packages/gateway/src/db/schema.js";
import { ProviderUsageService } from "../../../../packages/gateway/src/services/provider-usage.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/provider-usage.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_28_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordOllamaUsage("ollama", { limits: { session: { usage: 0.5, models: [] }, weekly: { usage: 0.8, models: [] } } });
    service.recordOllamaUsage("ollama", { source: "balance", limits: { monthly: { usage: 0.2, models: [] } } } as any);
    __jait_capture(0, (service.listForUser(["ollama"]).map((row) => row.rateLimitType)));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_35_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    const window = { status: "ok" as const, percent: 20, resetsAt: "2026-10-09T12:00:00Z" };
    service.recordOpenCodeGoUsage("go", { usage: { rolling: window, weekly: { ...window, percent: 90 }, monthly: { ...window, status: "rate-limited", percent: 100 } } });
    __jait_capture(0, (service.listForUser(["go"])), ([window.resetsAt]));
    service.recordOllamaUsage("ollama", { source: "settings", limits: {
      session: { usage: 0.4, models: [], resetsAt: window.resetsAt }, weekly: { usage: 0.8, models: [], resetsAt: null },
    } });
    __jait_capture(1, (service.listForUser(["ollama"])), ([window.resetsAt]));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_52_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-10-07T10:00:00Z"));
      service.recordOllamaUsage("ollama", { limits: { session: { usage: 0.42, models: [] } } });
      vi.setSystemTime(new Date("2026-10-07T10:01:00Z"));
      service.recordOllamaUsage("ollama", { range: "7d", scope: "self", granularity: "day", from: "2026-09-30T00:00:00Z", until: "2026-10-07T10:01:00Z", totals: { request_count: 50 }, buckets: [] });
      __jait_capture(0, (service.listForUser(["ollama"])));
      service.recordOllamaUsage("ollama", { limits: { session: { usage: 0.5, models: [] } } });
      __jait_capture(1, (service.listForUser(["ollama"])));
    } finally { vi.useRealTimers(); }
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_65_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordOllamaUsage("ollama", { limits: { session: { usage: 0.42, models: [] } }, totals: { request_count: 50 } } as any);
    __jait_capture(0, (service.listForUser(["ollama"])));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_70_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordOllamaUsage("ollama-1", { limits: { weekly: { usage: 0.8, models: [] } } });
    const activity = {
      range: "7d", scope: "self", granularity: "day",
      from: "2026-09-30T00:00:00Z", until: "2026-10-07T11:29:42Z",
      totals: { request_count: 10388 }, buckets: [],
    };
    service.recordOllamaUsage("ollama-1", activity, "pro", "test@example.com");
    service.recordOllamaUsage("ollama-1", activity, "pro", "test@example.com");
    __jait_capture(0, (service.listForUser(["ollama-1"])), ([activity.from,activity.until]));
    service.recordOllamaUsage("ollama-1", { limits: { weekly: { usage: 0.2, models: [] } } });
    __jait_capture(1, (service.listForUser(["ollama-1"])));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_89_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.4,
      resetsAt: 1_700_000_000,
    });

    const snapshots = service.listForUser(["account-1"]);
    __jait_capture(0, (snapshots));
    __jait_capture(1, (snapshots[0]));
    __jait_capture(2, (snapshots[0].resetsAt), (new Date(1_700_000_000 * 1000).toISOString()));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_111_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "seven_day",
      utilization: 0.2,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed_warning",
      rateLimitType: "seven_day",
      utilization: 0.95,
    });

    const snapshots = service.listForUser(["account-1"]);
    __jait_capture(0, (snapshots));
    __jait_capture(1, (snapshots[0].status));
    __jait_capture(2, (snapshots[0].utilization));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_130_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
    });
    service.recordClaudeRateLimit("account-2", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
    });

    __jait_capture(0, (service.listForUser(["account-1"])));
    __jait_capture(1, (service.listForUser(["account-1", "account-2"])));
    __jait_capture(2, (service.listForUser([])));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_146_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.95,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.97,
    });

    __jait_capture(0, (warning.mock.calls));
    __jait_capture(1, (warning.mock.calls));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_166_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed_warning",
      rateLimitType: "seven_day",
    });

    __jait_capture(0, (warning.mock.calls));
    __jait_capture(1, (warning.mock.calls));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_180_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.95,
    });
    __jait_capture(0, (warning.mock.calls));

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.3,
    });
    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.96,
    });
    __jait_capture(1, (warning.mock.calls));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_205_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const { service: notifications, warning } = makeNotifications();
    const service = new ProviderUsageService(db);
    service.attachNotifications(notifications);

    service.recordClaudeRateLimit("account-1", "claude", {
      status: "allowed",
      rateLimitType: "five_hour",
      utilization: 0.5,
    });

    __jait_capture(0, (warning.mock.calls));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_219_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-account", {
      rateLimits: {
        primary: {
          usedPercent: 12,
          windowDurationMins: 300,
          resetsAt: 1_700_000_000,
        },
        secondary: {
          usedPercent: 34,
          windowDurationMins: 10_080,
          resetsAt: 1_700_100_000,
        },
        planType: "plus",
        credits: { hasCredits: true, balance: "7.50" },
      },
    });

    const snapshots = service.listForUser(["codex-account"]);
    __jait_capture(0, (snapshots));
    __jait_capture(1, (snapshots), ([new Date(1_700_000_000 * 1000).toISOString()]));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_259_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-account", {
      rateLimits: {
        primary: { usedPercent: 12, windowDurationMins: 300, resetsAt: 1_700_000_000 },
      },
      rateLimitResetCredits: {
        availableCount: 2,
        credits: [
          {
            id: "RateLimitResetCredit_1",
            resetType: "codexRateLimits",
            status: "available",
            grantedAt: 1_700_000_000,
            expiresAt: 1_702_000_000,
            title: "Full reset (Weekly + 5 hr)",
          },
        ],
      },
    });

    const snapshots = service.listForUser(["codex-account"]);
    __jait_capture(0, (snapshots));
    __jait_capture(1, (snapshots[0]?.resetCredits));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_290_3_each0": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const ordinaryUsageAllowed = true;
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-plus", {
      ordinaryUsageAllowed,
      rateLimits: {
        primary: { usedPercent: 15, windowDurationMins: 300 },
        secondary: { usedPercent: 18, windowDurationMins: 10_080 },
        planType: "plus",
        credits: { hasCredits: false, unlimited: false, balance: "0" },
      },
    });

    __jait_capture(0, (service.listForUser(["codex-plus"])));
  
})();

} finally {
await __jait_hook_584();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_290_3_each1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const ordinaryUsageAllowed = undefined;
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-plus", {
      ordinaryUsageAllowed,
      rateLimits: {
        primary: { usedPercent: 15, windowDurationMins: 300 },
        secondary: { usedPercent: 18, windowDurationMins: 10_080 },
        planType: "plus",
        credits: { hasCredits: false, unlimited: false, balance: "0" },
      },
    });

    __jait_capture(0, (service.listForUser(["codex-plus"])));
  
})();

} finally {
await __jait_hook_584();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_308_3_each0": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const block = { ordinaryUsageAllowed: false, rateLimits: {} };
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-blocked", {
      ...block,
      rateLimits: {
        ...block.rateLimits,
        primary: { usedPercent: 15, windowDurationMins: 300 },
      },
    });
    __jait_capture(0, (service.listForUser(["codex-blocked"])[0].status));
  
})();

} finally {
await __jait_hook_584();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_308_3_each1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const block = { rateLimits: { spendControlReached: true } };
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-blocked", {
      ...block,
      rateLimits: {
        ...block.rateLimits,
        primary: { usedPercent: 15, windowDurationMins: 300 },
      },
    });
    __jait_capture(0, (service.listForUser(["codex-blocked"])[0].status));
  
})();

} finally {
await __jait_hook_584();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_308_3_each2": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const block = { rateLimits: { rateLimitReachedType: "workspace_member_credits_depleted" } };
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    service.recordCodexRateLimits("codex-blocked", {
      ...block,
      rateLimits: {
        ...block.rateLimits,
        primary: { usedPercent: 15, windowDurationMins: 300 },
      },
    });
    __jait_capture(0, (service.listForUser(["codex-blocked"])[0].status));
  
})();

} finally {
await __jait_hook_584();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_324_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    for (const [usedPercent, status] of [[100, "rejected"], [95, "allowed_warning"], [15, "allowed"]] as const) {
      service.recordCodexRateLimits("codex-plus", {
        rateLimits: {
          primary: { usedPercent, windowDurationMins: 300 },
          credits: { hasCredits: false },
        },
      });
      __jait_capture(0, (service.listForUser(["codex-plus"])[0].status), (status));
    }
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_337_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    // Shape reported by the live Work (team) account: the workspace blocks
    // ordinary usage even though only the 5h window sits at 100%.
    service.recordCodexRateLimits("codex-work", {
      ordinaryUsageAllowed: false,
      rateLimits: {
        primary: {
          usedPercent: 100,
          windowDurationMins: 300,
          resetsAt: 1_792_364_608,
        },
        secondary: {
          usedPercent: 63,
          windowDurationMins: 10_080,
          resetsAt: 1_792_500_000,
        },
        planType: "team",
        rateLimitReachedType: "workspace_member_credits_depleted",
        spendControlReached: false,
        credits: { hasCredits: false },
      },
    });

    const snapshots = service.listForUser(["codex-work"]);
    __jait_capture(0, (snapshots));
    __jait_capture(1, (snapshots));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_380_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-11T09:37:00.000Z"));
    try {
      service.recordOllamaUsage(
        "ollama",
        {
          limits: {
            session: {
              usage: 0.25,
              models: [{ name: "gpt-oss", request_count: 4 }],
            },
            weekly: { usage: 0.4, models: [] },
            monthly: { usage: 0.6, models: [] },
          },
          activity: {
            cost: "3.20",
            period: { ending_at: "2026-10-01T00:00:00.000Z" },
          },
        },
        "pro",
      );

      const snapshots = service.listForUser(["ollama"]);
      __jait_capture(0, (snapshots));
      // The reported activity period is *not* a reset time — echoing it made the
      // Usage modal claim the quota reset at fetch time. Each window instead gets
      // a reset derived from the boundaries Ollama exposes.
      __jait_capture(1, (snapshots.map((snapshot) => snapshot.resetsAt)));
      __jait_capture(2, (snapshots));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_435_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const service = new ProviderUsageService(db);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-03-11T10:20:00.000Z"));
    try {
      db.insert(providerUsage).values({
        accountId: "ollama",
        rateLimitType: "five_hour",
        providerType: "ollama",
        utilization: 0.82,
        resetsAt: "2026-03-11T10:00:00.000Z",
        updatedAt: "2026-03-11T09:37:00.000Z",
        rawJson: JSON.stringify({ resetSource: "observed", windowStartAt: "2026-03-11T05:00:00.000Z" }),
      }).run();

      // Ollama reports 0.03 used: the quota demonstrably reset since the snapshot above.
      service.recordOllamaUsage(
        "ollama",
        {
          limits: {
            session: { usage: 0.03, models: [] },
            weekly: { usage: 0.4, models: [] },
            monthly: { usage: 0.6, models: [] },
          },
          activity: { cost: "0", period: { starting_at: "2026-03-09T00:00:00.000Z" } },
        },
        "pro",
      );

      const session = service
        .listForUser(["ollama"])
        .find((snapshot) => snapshot.rateLimitType === "five_hour");
      __jait_capture(0, (session?.resetsAt));
    } finally {
      vi.useRealTimers();
    }
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_provider_usage_test_ts_472_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
function makeNotifications() {
  const warning = vi.fn();
  return { warning, service: { warning } as unknown as NotificationService };
}
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
};
const __jait_hook_584 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    db.insert(providerUsage).values({
      accountId: "ollama",
      rateLimitType: "five_hour",
      providerType: "ollama",
      utilization: 0.25,
      resetsAt: "2026-09-20T13:45:00.000Z",
      updatedAt: "2026-09-20T13:45:00.000Z",
      rawJson: "{}",
    }).run();
    const service = new ProviderUsageService(db);
    __jait_capture(0, (service.listForUser(["ollama"])[0]));
  
})();

} finally {
await __jait_hook_584();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
