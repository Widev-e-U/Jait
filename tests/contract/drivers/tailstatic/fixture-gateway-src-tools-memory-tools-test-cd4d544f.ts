// Translated fixture from packages/gateway/src/tools/memory-tools.test.ts; expected literals are in tail_static.rs.
import type { MemoryEntry, MemoryService, SaveMemoryInput } from "../../../../packages/gateway/src/memory/contracts.js";
import type { ReminderRow, ReminderService } from "../../../../packages/gateway/src/services/reminders.js";
import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { createMemoryForgetTool, createMemoryHygieneTool, createMemoryListTool, createMemoryReviewChatsTool, createMemorySaveTool, createMemorySearchTool, createMemoryUpdateTool } from "../../../../packages/gateway/src/tools/memory-tools.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/memory-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_46_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const created = reminder();
    const reminders = {
      create: (params: { content: string; userId?: string; sessionId?: string | null }) => ({
        ...created,
        content: params.content,
        userId: params.userId ?? null,
        sessionId: params.sessionId ?? null,
      }),
    } as unknown as ReminderService;
    const memory = {
      save: async (input: SaveMemoryInput) => memoryEntry({ content: input.content }),
      list: async () => [],
    } as unknown as MemoryService;
    const tool = createMemorySaveTool(memory, reminders);

    const result = await tool.execute({
      kind: "reminder",
      scope: "project",
      content: "Remember this",
      sourceType: "agent",
      sourceId: "action-1",
      sourceSurface: "chat",
    }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_76_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const memory = {
      list: async () => [memoryEntry()],
      search: async () => [memoryEntry()],
    } as unknown as MemoryService;
    const reminders = {
      list: () => [reminder()],
    } as unknown as ReminderService;
    const tool = createMemorySearchTool(memory, reminders);

    const result = await tool.execute({ query: "remember", limit: 3 }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    __jait_capture(2, (result.message));
    __jait_capture(3, (result.message));
    __jait_capture(4, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_98_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reminders = {
      list: (options: { userId?: string; status?: string; limit?: number }) => [reminder({
        userId: options.userId ?? null,
        status: options.status === "archived" ? "archived" : "active",
      })],
    } as unknown as ReminderService;
    const tool = createMemoryListTool(reminders);

    const result = await tool.execute({ status: "archived", limit: 10 }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
    __jait_capture(2, (result.message));
    __jait_capture(3, (result.message));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_115_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const reminders = {
      update: (id: string, params: { content?: string; status?: string }, userId?: string) => reminder({
        id,
        userId: userId ?? null,
        content: params.content ?? "Reminder",
        status: params.status === "archived" ? "archived" : "active",
      }),
    } as unknown as ReminderService;
    const tool = createMemoryUpdateTool(reminders);

    const result = await tool.execute({ id: "reminder-1", content: "Updated", status: "archived" }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.data));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_132_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const memory = {
      list: async () => [],
      forget: async () => false,
    } as unknown as MemoryService;
    const reminders = {
      delete: () => true,
    } as unknown as ReminderService;
    const tool = createMemoryForgetTool(memory, reminders);

    const result = await tool.execute({ id: "reminder-1" }, context);

    __jait_capture(0, (result));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_147_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let receivedUserId: string | undefined;
    const reminders = {
      runHygiene: (userId?: string) => {
        receivedUserId = userId;
        return { archived: 1, flagged: 2 };
      },
    } as unknown as ReminderService;
    const tool = createMemoryHygieneTool(reminders);

    const result = await tool.execute({ userId: "other-user" } as never, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (receivedUserId));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_memory_tools_test_ts_163_3": {


const context: ToolContext = {
  sessionId: "session-1",
  actionId: "action-1",
  projectRoot: "/project/jait",
  requestedBy: "user",
  userId: "user-1",
};
function memoryEntry(overrides: Partial<MemoryEntry> = {}): MemoryEntry {
  return {
    id: "memory-1",
    scope: "project",
    content: "Memory",
    source: { type: "agent", id: "action-1", surface: "chat" },
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
function reminder(overrides: Partial<ReminderRow> = {}): ReminderRow {
  return {
    id: "reminder-1",
    userId: "user-1",
    projectId: "project-1",
    sessionId: "session-1",
    content: "Reminder",
    sourceType: "agent",
    sourceId: "action-1",
    sourceSurface: "chat",
    status: "active",
    tags: "[]",
    createdAt: "2026-05-07T00:00:00.000Z",
    updatedAt: "2026-05-07T00:00:00.000Z",
    ...overrides,
  };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    let received: { userId?: string; limit?: number } = {};
    const reminders = {
      scanOldChatsForMemory: (userId?: string, limit?: number) => {
        received = { userId, limit };
        return { scanned: 3, created: 1 };
      },
    } as unknown as ReminderService;
    const tool = createMemoryReviewChatsTool(reminders);

    const result = await tool.execute({ userId: "other-user", limit: 25 } as { limit?: number }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (received));
  
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
