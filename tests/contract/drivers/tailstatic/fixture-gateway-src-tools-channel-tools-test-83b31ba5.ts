// Translated fixture from packages/gateway/src/tools/channel-tools.test.ts; expected literals are in tail_static.rs.
import {
  createChannelRemindTool,
  createChannelSendTool,
  cronForLocalStamp,
  parseChannelSessionId,
  parseLocalStamp,
  type ChannelToolDeps,
} from "../../../../packages/gateway/src/tools/channel-tools.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/channel-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_45_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseChannelSessionId("channel:telegram:4242")));
    __jait_capture(1, (parseChannelSessionId("channel:whatsapp:4915112345678@s.whatsapp.net:12")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_56_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (parseChannelSessionId("web-chat-42")));
    __jait_captureType(1, (parseChannelSessionId("channel:telegram")));
    __jait_captureType(2, (parseChannelSessionId("channel:telegram:")));
    __jait_captureType(3, (parseChannelSessionId(undefined)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_65_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseLocalStamp("2026-08-09T05:00")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_71_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (parseLocalStamp("2026-08-09T05:00:00Z")));
    __jait_captureType(1, (parseLocalStamp("2026-08-09T05:00+02:00")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_76_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (parseLocalStamp("2026-13-09T05:00")));
    __jait_captureType(1, (parseLocalStamp("2026-08-09T25:00")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_81_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (cronForLocalStamp({ year: 2026, month: 8, day: 9, hour: 5, minute: 0 })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_87_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, delivered } = deps();
    const result = await createChannelSendTool(d).execute({ text: "done" }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (delivered));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_97_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, delivered } = deps();
    await createChannelSendTool(d).execute(
      { text: "hi", channelId: "whatsapp", conversationId: "999" },
      context(),
    );
    __jait_capture(0, (delivered[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_106_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, delivered } = deps();
    const result = await createChannelSendTool(d).execute({ text: "hi" }, context({ sessionId: "web-1" }));

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (delivered));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_115_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d } = deps({
      channels: { deliver: async () => { throw new Error("channel is stopped"); } },
    });
    const result = await createChannelSendTool(d).execute({ text: "hi" }, context());

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_127_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "Anlage prüfen" },
      context({ userId: "user-1" }),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (created));
    __jait_capture(2, (created[0]));
    __jait_capture(3, (created[0]!["input"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_150_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { cron: "0 7 * * 1-5", prompt: "Summarise today's calendar" },
      context(),
    );

    __jait_capture(0, (result.ok));
    const input = created[0]!["input"] as Record<string, unknown>;
    __jait_capture(1, (input["prompt"]));
    __jait_capture(2, (input["__jaitJobMeta"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_163_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // 09:00 UTC is 11:00 in Vienna, so 10:00 local is behind us.
    const { deps: d, created } = deps();
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-08T10:00", text: "too late" },
      context(),
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (created));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_176_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // 10:00 in Tokyo on the 8th is already past 09:00 UTC; 20:00 is not.
    const { deps: d, created } = deps();
    const remind = createChannelRemindTool(d);

    __jait_capture(0, ((await remind.execute({ at: "2026-08-08T10:00", text: "x", timeZone: "Asia/Tokyo" }, context())).ok));
    __jait_capture(1, ((await remind.execute({ at: "2026-08-08T20:00", text: "x", timeZone: "Asia/Tokyo" }, context())).ok));
    __jait_capture(2, ((created[0]!["input"] as Record<string, unknown>)["__jaitJobMeta"]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_189_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d } = deps();
    const remind = createChannelRemindTool(d);

    __jait_capture(0, ((await remind.execute({ text: "x" }, context())).message));
    __jait_capture(1, ((await remind.execute({ at: "2026-08-09T05:00" }, context())).message));
    __jait_capture(2, ((await remind.execute({ at: "2026-08-09T05:00", cron: "* * * * *", text: "x" }, context())).message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_199_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d } = deps({ scheduler: undefined });
    const result = await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "x" },
      context(),
    );
    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_channel_tools_test_ts_209_3": {


const NOW = new Date("2026-08-08T09:00:00Z");
function context(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionId: "channel:telegram:4242",
    actionId: "action-1",
    projectRoot: "/tmp/project",
    requestedBy: "channel:telegram",
    ...overrides,
  };
}
function deps(overrides: Partial<ChannelToolDeps> = {}) {
  const created: Array<Record<string, unknown>> = [];
  const delivered: Array<Record<string, unknown>> = [];
  const base: ChannelToolDeps = {
    channels: {
      deliver: async (params) => { delivered.push(params); },
    },
    scheduler: {
      create: (params: Record<string, unknown>) => {
        created.push(params);
        return { id: "job-1", ...params };
      },
    } as unknown as ChannelToolDeps["scheduler"],
    defaultTimeZone: () => "Europe/Vienna",
    now: () => NOW,
    ...overrides,
  };
  return { deps: base, created, delivered };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { deps: d, created } = deps();
    await createChannelRemindTool(d).execute(
      { at: "2026-08-09T05:00", text: "Bring the car in for its service" },
      context(),
    );
    __jait_capture(0, (created[0]!["name"]));
  
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
