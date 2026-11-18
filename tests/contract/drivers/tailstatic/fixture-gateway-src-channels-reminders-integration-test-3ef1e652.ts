// Translated fixture from packages/gateway/src/channels/reminders.integration.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { openRawSqlite } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { SchedulerService } from "../../../../packages/gateway/src/scheduler/service.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createChannelRemindTool, createChannelSendTool } from "../../../../packages/gateway/src/tools/channel-tools.js";
import { ChannelManager, type ReplyGenerator } from "../../../../packages/gateway/src/channels/manager.js";
import type {
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  OutboundMessage,
} from "../../../../packages/gateway/src/channels/types.js";
import type { LLMConfig } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/channels/reminders.integration.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_channels_reminders_integration_test_ts_102_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}
const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};
async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}
const NOW = new Date("2026-08-08T09:00:00Z");
const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, scheduler, connector } = await harness(NOW);

    const scheduled = await registry.execute(
      "channel.remind",
      { at: "2026-08-09T05:00", text: "Anlage prüfen" },
      CHANNEL_SESSION,
    );
    __jait_capture(0, (scheduled.ok));
    __jait_capture(1, (scheduler.list()));

    // 04:59 Vienna the next morning — one minute early, nothing yet.
    await scheduler.tick(new Date("2026-08-09T02:59:00Z"));
    __jait_capture(2, (connector.sent));

    // 05:00 Vienna.
    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));
    __jait_capture(3, (connector.sent.map((m) => m.text)));
    __jait_capture(4, (connector.sent[0]!.conversationId));

    // Delivered, so it is gone — not left sitting in the list as "done".
    __jait_capture(5, (scheduler.list()));

    // A year later the same cron minute comes round again — and stays quiet.
    await scheduler.tick(new Date("2027-08-09T03:00:00Z"));
    __jait_capture(6, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_reminders_integration_test_ts_130_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}
const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};
async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}
const NOW = new Date("2026-08-08T09:00:00Z");
const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T07:00", prompt: "What is on today?" },
      CHANNEL_SESSION,
    );
    __jait_capture(0, (connector.sent));

    await scheduler.tick(new Date("2026-08-09T05:00:00Z"));

    __jait_capture(1, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_reminders_integration_test_ts_145_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}
const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};
async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}
const NOW = new Date("2026-08-08T09:00:00Z");
const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { cron: "0 7 * * *", text: "Guten Morgen" },
      CHANNEL_SESSION,
    );

    await scheduler.tick(new Date("2026-08-09T05:00:00Z"));
    await scheduler.tick(new Date("2026-08-10T05:00:00Z"));

    __jait_capture(0, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_reminders_integration_test_ts_160_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}
const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};
async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}
const NOW = new Date("2026-08-08T09:00:00Z");
const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, scheduler, manager, connector } = await harness(NOW);
    await registry.execute("channel.remind", { at: "2026-08-09T05:00", text: "x" }, CHANNEL_SESSION);

    await manager.stop("telegram");
    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));

    __jait_capture(0, (connector.sent));
    const job = scheduler.list()[0]!;
    __jait_capture(1, (job.enabled));
    __jait_capture(2, (scheduler.listRuns(job.id)[0]));

    // Still there the next morning; collected once it is a day old.
    __jait_capture(3, (scheduler.purgeSpentOneShots(new Date("2026-08-09T09:00:00Z"))));
    __jait_capture(4, (scheduler.purgeSpentOneShots(new Date("2026-08-10T09:00:00Z"))));
    __jait_capture(5, (scheduler.list()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_reminders_integration_test_ts_178_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "telegram";
  readonly label = "Telegram";
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  async start(events: ChannelConnectorEvents) {
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }
  status() { return this._status; }
  currentQr() { return null; }
}
const fakeLLM = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as unknown as LLMConfig;
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `answer: ${String(last?.content ?? "")}`;
  },
};
async function harness(now: Date) {
  const { db, sqlite: drizzleSqlite } = await openDatabase(":memory:");
  migrateDatabase(drizzleSqlite);

  const registry = new ToolRegistry();
  const scheduler = new SchedulerService({
    db,
    executeTool: ({ toolName, input, sessionId, projectRoot, userId }) =>
      registry.execute(toolName, input, {
        sessionId,
        actionId: "scheduled",
        projectRoot,
        requestedBy: "scheduler",
        ...(userId ? { userId } : {}),
      }),
  });

  const manager = new ChannelManager({
    sqlite: await openRawSqlite(":memory:"),
    resolveLLM: () => fakeLLM,
    replyGenerator: echoGenerator,
    log: () => {},
  });
  const connector = new FakeConnector();
  manager.register(connector);
  await manager.start("telegram");

  const deps = {
    channels: manager,
    scheduler,
    defaultTimeZone: () => "Europe/Vienna",
    now: () => now,
  };
  registry.register(createChannelSendTool(deps));
  registry.register(createChannelRemindTool(deps));

  return { registry, scheduler, manager, connector };
}
const NOW = new Date("2026-08-08T09:00:00Z");
const CHANNEL_SESSION = {
  sessionId: "channel:telegram:4242",
  actionId: "a1",
  projectRoot: "/tmp",
  requestedBy: "channel:telegram",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { registry, scheduler, connector } = await harness(NOW);

    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T05:00", text: "for chat A" },
      { ...CHANNEL_SESSION, sessionId: "channel:telegram:chat-A" },
    );
    await registry.execute(
      "channel.remind",
      { at: "2026-08-09T06:00", text: "for chat B" },
      { ...CHANNEL_SESSION, sessionId: "channel:telegram:chat-B" },
    );

    await scheduler.tick(new Date("2026-08-09T03:00:00Z"));
    await scheduler.tick(new Date("2026-08-09T04:00:00Z"));

    __jait_capture(0, (connector.sent));
  
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
