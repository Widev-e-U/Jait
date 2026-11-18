// Translated fixture from packages/gateway/src/scheduler/service.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { isOneShotJob, SchedulerService } from "../../../../packages/gateway/src/scheduler/service.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/scheduler/service.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_22_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isOneShotJob(oneShotInput())));
    __jait_capture(1, (isOneShotJob({ __jaitJobMeta: { jobType: "channel_reminder" } })));
    __jait_capture(2, (isOneShotJob({ once: true })));
    __jait_capture(3, (isOneShotJob(null)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_29_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { scheduler: s } = await scheduler();
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await s.trigger(job.id, undefined, new Date("2026-08-09T03:00:00Z"), "schedule");

    __jait_captureType(0, (s.get(job.id)));
    __jait_capture(1, (s.list()));
    // The run row went with it — nothing can join it back to a name.
    __jait_capture(2, (s.listRuns(job.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_41_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await __jait_rejected(0, s.trigger(job.id, undefined, new Date("2026-08-09T03:00:00Z"), "schedule"));

    __jait_capture(1, (s.get(job.id)?.enabled));
    __jait_capture(2, (s.listRuns(job.id)[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_51_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { scheduler: s } = await scheduler();
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    await s.trigger(job.id, undefined, new Date("2026-08-08T09:00:00Z"), "manual");

    __jait_capture(0, (s.get(job.id)?.enabled));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_60_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { scheduler: s } = await scheduler();
    const job = s.create({
      name: "morning briefing",
      cron: "0 7 * * *",
      toolName: "channel.send",
      input: { channelId: "telegram", conversationId: "4242", __jaitJobMeta: { jobType: "channel_reminder" } },
    });

    await s.trigger(job.id, undefined, new Date("2026-08-09T05:00:00Z"), "schedule");

    __jait_capture(0, (s.get(job.id)?.enabled));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_74_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { scheduler: s, executeTool } = await scheduler();
    s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });

    // Same wall-clock minute in Vienna (05:00) on the scheduled day, ticked
    // twice as the poller would across a restart.
    await s.tick(new Date("2026-08-09T03:00:00Z"));
    await s.tick(new Date("2026-08-09T03:00:30Z"));

    __jait_capture(0, (executeTool.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_88_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let releaseSlowJob: (() => void) | undefined;
    const slowJobBlocked = new Promise<void>((resolve) => { releaseSlowJob = resolve; });
    const executeTool = vi.fn(async ({ toolName }: { toolName: string }) => {
      if (toolName === "slow.tool") await slowJobBlocked;
      return { ok: true, message: "done" };
    });
    const { scheduler: s } = await scheduler(executeTool);
    s.create({ name: "fast", cron: "0 * * * *", toolName: "fast.tool" });
    await new Promise((resolve) => setTimeout(resolve, 2));
    s.create({ name: "slow", cron: "0 * * * *", toolName: "slow.tool" });

    const tick = s.tick(new Date("2026-09-08T18:00:00Z"));
    await vi.waitFor(() => {
      __jait_capture(0, (executeTool.mock.calls));
    });

    releaseSlowJob?.();
    await tick;
  
})();
__jait_record({slot:1,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_109_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let releaseSlowJob: (() => void) | undefined;
    const slowJobBlocked = new Promise<void>((resolve) => { releaseSlowJob = resolve; });
    const executeTool = vi.fn(async ({ toolName }: { toolName: string }) => {
      if (toolName === "slow.tool") await slowJobBlocked;
      return { ok: true, message: "done" };
    });
    const { scheduler: s } = await scheduler(executeTool);
    s.create({ name: "slow", cron: "0 * * * *", toolName: "slow.tool" });
    s.create({ name: "later", cron: "1 * * * *", toolName: "later.tool" });

    const firstTick = s.tick(new Date("2026-09-08T18:00:00Z"));
    await vi.waitFor(() => {
      __jait_capture(0, (executeTool.mock.calls));
    });

    await s.tick(new Date("2026-09-08T18:01:00Z"));
    __jait_capture(1, (executeTool.mock.calls));

    releaseSlowJob?.();
    await firstTick;
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_132_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let releaseJob: (() => void) | undefined;
    const jobBlocked = new Promise<void>((resolve) => { releaseJob = resolve; });
    const executeTool = vi.fn(async () => {
      await jobBlocked;
      return { ok: true, message: "done" };
    });
    const { scheduler: s } = await scheduler(executeTool);
    s.create({ name: "slow", cron: "* * * * *", toolName: "slow.tool" });

    const firstTick = s.tick(new Date("2026-09-08T18:00:00Z"));
    await vi.waitFor(() => __jait_capture(0, (executeTool.mock.calls)));
    await s.tick(new Date("2026-09-08T18:01:00Z"));
    __jait_capture(1, (executeTool.mock.calls));

    releaseJob?.();
    await firstTick;
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_162_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{
async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await __jait_rejected(0, s.trigger(job.id, undefined, firedAt, "schedule"));
    return { scheduler: s, job };
  }

try {
await (async()=>{

    const { scheduler: s } = await failedOneShot(2);

    __jait_capture(1, (s.purgeSpentOneShots()));
    __jait_capture(2, (s.list()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_169_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{
async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await __jait_rejected(0, s.trigger(job.id, undefined, firedAt, "schedule"));
    return { scheduler: s, job };
  }

try {
await (async()=>{

    const { scheduler: s, job } = await failedOneShot(30);

    __jait_capture(1, (s.purgeSpentOneShots()));
    __jait_captureType(2, (s.get(job.id)));
    __jait_capture(3, (s.listRuns(job.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_177_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{
async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await __jait_rejected(0, s.trigger(job.id, undefined, firedAt, "schedule"));
    return { scheduler: s, job };
  }

try {
await (async()=>{

    const { scheduler: s } = await scheduler();
    // Disabled by hand before its time — the user's choice, not a spent job.
    const job = s.create({ name: "later", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    s.update(job.id, { enabled: false });

    __jait_capture(1, (s.purgeSpentOneShots()));
    __jait_captureType(2, (s.get(job.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_187_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{
async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await __jait_rejected(0, s.trigger(job.id, undefined, firedAt, "schedule"));
    return { scheduler: s, job };
  }

try {
await (async()=>{

    const { scheduler: s } = await scheduler();
    const job = s.create({
      name: "morning briefing",
      cron: "0 7 * * *",
      toolName: "channel.send",
      input: { channelId: "telegram", conversationId: "4242", __jaitJobMeta: { jobType: "channel_reminder" } },
    });
    await s.trigger(job.id, undefined, new Date(Date.now() - 72 * 60 * 60 * 1000), "schedule");
    s.update(job.id, { enabled: false });

    __jait_capture(1, (s.purgeSpentOneShots()));
    __jait_captureType(2, (s.get(job.id)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_scheduler_service_test_ts_202_3": {


async function scheduler(executeTool = vi.fn(async () => ({ ok: true, message: "done" }))) {
  const { db, sqlite } = await openDatabase(":memory:");
  migrateDatabase(sqlite);
  return { scheduler: new SchedulerService({ db, executeTool }), executeTool };
}
function oneShotInput(extra: Record<string, unknown> = {}) {
  return {
    channelId: "telegram",
    conversationId: "4242",
    text: "Anlage prüfen",
    __jaitJobMeta: { jobType: "channel_reminder", timeZone: "Europe/Vienna", once: true, ...extra },
  };
}
/*__jait_scope_open__*/{
async function failedOneShot(hoursAgo: number) {
    const { scheduler: s } = await scheduler(vi.fn(async () => { throw new Error("channel is stopped"); }));
    const firedAt = new Date(Date.now() - hoursAgo * 60 * 60 * 1000);
    const job = s.create({ name: "reminder", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    await __jait_rejected(0, s.trigger(job.id, undefined, firedAt, "schedule"));
    return { scheduler: s, job };
  }

try {
await (async()=>{

    const { scheduler: s } = await failedOneShot(30);
    const now = new Date();

    await s.tick(now);
    __jait_capture(1, (s.list()));

    // A second spent job appearing right after must wait for the next window
    // rather than being swept by a tick a minute later.
    const job = s.create({ name: "another", cron: "0 5 9 8 *", toolName: "channel.send", input: oneShotInput() });
    s.update(job.id, { enabled: false });
    await s.tick(new Date(now.getTime() + 60_000));

    __jait_captureType(2, (s.get(job.id)));
  
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
