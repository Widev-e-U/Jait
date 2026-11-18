// Translated fixture from packages/gateway/src/services/session-search.test.ts; expected literals are in tail_static.rs.

import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";
import { SessionSearchService, buildFtsQuery } from "../../../../packages/gateway/src/services/session-search.js";
import { ChatTracesService } from "../../../../packages/gateway/src/services/chat-traces.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { ThreadService } from "../../../../packages/gateway/src/services/threads.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/session-search.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_session_search_test_ts_11_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildFtsQuery('rollback OR "drop" -table')));
    __jait_captureType(1, (buildFtsQuery("!")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_search_test_ts_16_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const search = new SessionSearchService(sqlite);
      const session = sessionService.create({ userId: "user-1", name: "Rollback planning" });
      const otherSession = sessionService.create({ userId: "user-2", name: "Private notes" });
      const now = new Date().toISOString();

      db.insert(messages).values([
        {
          id: "msg-user-1",
          sessionId: session.id,
          role: "user",
          content: "Please preserve the rollback sentinel in the migration plan.",
          createdAt: now,
        },
        {
          id: "msg-user-2",
          sessionId: otherSession.id,
          role: "user",
          content: "A private zephyr rollback note from another user.",
          createdAt: now,
        },
      ]).run();

      const thread = threadService.create({
        userId: "user-1",
        sessionId: session.id,
        title: "Migration thread",
        providerId: "jait",
      });
      threadService.addActivity(thread.id, "message", "Captured migration context", {
        content: "Thread activity mentions rollback sentinel coverage.",
      });

      const results = search.search({ query: "rollback sentinel", userId: "user-1", limit: 10 });

      __jait_capture(0, (results), ([session.id,thread.id]));
      __jait_capture(1, (results.some((result) => result.id === "msg-user-2")));

      const privateResults = search.search({ query: "private zephyr", userId: "user-1" });
      __jait_capture(2, (privateResults));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_search_test_ts_79_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const search = new SessionSearchService(sqlite);
      const session = sessionService.create({ userId: "user-1", name: "Index updates" });

      db.insert(messages).values({
        id: "msg-update",
        sessionId: session.id,
        role: "assistant",
        content: "Initial phrase about compact summaries.",
        createdAt: new Date().toISOString(),
      }).run();

      __jait_capture(0, (search.search({
        query: "compact summaries",
        userId: "user-1",
        includeThreadActivities: false,
      })));

      db.update(messages)
        .set({ content: "Updated phrase about durable session search." })
        .where(eq(messages.id, "msg-update"))
        .run();

      __jait_capture(1, (search.search({ query: "compact summaries", userId: "user-1" })));
      const updated = search.search({ query: "durable session", userId: "user-1", includeThreadActivities: false });
      __jait_capture(2, (updated), ([session.id]));

      db.delete(messages).where(eq(messages.id, "msg-update")).run();
      __jait_capture(3, (search.search({ query: "durable session", userId: "user-1" })));
    } finally {
      sqlite.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_session_search_test_ts_123_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    try {
      const sessionService = new SessionService(db);
      const threadService = new ThreadService(db);
      const search = new SessionSearchService(sqlite);
      const session = sessionService.create({ userId: "user-1", name: "Focused activity search" });
      const thread = threadService.create({
        userId: "user-1",
        sessionId: session.id,
        title: "Searchable thread",
        providerId: "jait",
      });

      const durable = threadService.addActivity(thread.id, "tool.result", "Migration inspection completed", {
        content: "durableresultmarker appears in the final tool result",
      });
      const noisy = threadService.addActivity(thread.id, "context_flow", "Outbound context snapshot", {
        content: "contextpollutionmarker appears in a diagnostic context dump",
      });
      threadService.addActivity(thread.id, "codex/event/exec_command_output_delta", "stream chunk", {
        content: "streamfragmentmarker appears in transient output",
      });

      __jait_capture(0, (search.search({ query: "durableresultmarker", userId: "user-1" })), ([durable.id]));
      __jait_capture(1, (search.search({ query: "contextpollutionmarker", userId: "user-1" })));
      __jait_capture(2, (search.search({ query: "streamfragmentmarker", userId: "user-1" })));

      const trace = new ChatTracesService(sqlite).traces({
        chatId: session.id,
        userId: "user-1",
        includeMessages: false,
      });
      __jait_capture(3, (trace.threads[0]?.activities), ([noisy.id]));

      sqlite.prepare(`UPDATE agent_thread_activities SET kind = 'message' WHERE id = ?`).run(noisy.id);
      __jait_capture(4, (search.search({ query: "contextpollutionmarker", userId: "user-1" })), ([noisy.id]));

      sqlite.prepare(`UPDATE agent_thread_activities SET kind = 'context_flow' WHERE id = ?`).run(durable.id);
      __jait_capture(5, (search.search({ query: "durableresultmarker", userId: "user-1" })));
    } finally {
      sqlite.close();
    }
  
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
