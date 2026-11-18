// Translated fixture from packages/gateway/src/routes/chat-auth.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messageContextMetadata, messages } from "../../../../packages/gateway/src/db/schema.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { __chatTestUtils } from "../../../../packages/gateway/src/routes/chat.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-auth.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_25_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = await createServer(testConfig);

    const chat = await app.inject({ method: "POST", url: "/api/chat", payload: { content: "hello", sessionId: "s1" } });
    const messages = await app.inject({ method: "GET", url: "/api/sessions/s1/messages" });
    const stream = await app.inject({ method: "GET", url: "/api/sessions/s1/stream" });
    const cancel = await app.inject({ method: "POST", url: "/api/sessions/s1/cancel" });

    __jait_capture(0, (chat.statusCode));
    __jait_capture(1, (messages.statusCode));
    __jait_capture(2, (stream.statusCode));
    __jait_capture(3, (cancel.statusCode));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_41_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "POST",
      url: "/api/sessions/no-active-stream/cancel",
      headers,
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.json()));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_57_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const app = await createServer(testConfig);
    const headers = await authHeaders();

    const res = await app.inject({
      method: "GET",
      url: "/api/sessions/new-session/stream",
      headers,
    });

    __jait_capture(0, (res.statusCode));
    __jait_capture(1, (res.headers["content-type"]));
    __jait_capture(2, (res.headers["cache-control"]));
    __jait_capture(3, (res.headers["x-accel-buffering"]));
    __jait_capture(4, (res.headers["content-encoding"]));
    const dataLines = res.body
      .split("\n")
      .filter((line) => line.startsWith("data: "))
      .map((line) => JSON.parse(line.slice(6)) as Record<string, unknown>);

    __jait_capture(5, (dataLines[0]));
    __jait_capture(6, (dataLines[1]));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_83_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("chat-history-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Progressive History" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const createdAt = (index: number) => new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString();

    db.insert(messages).values(Array.from({ length: 8 }, (_, index) => ({
      id: `message-${index}`,
      sessionId: session.id,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `content-${index}`,
      contextFlow: index === 7 ? JSON.stringify({ rounds: [], unused: "large-context-payload" }) : null,
      createdAt: createdAt(index),
    }))).run();
    db.insert(messageContextMetadata).values({
      messageId: "message-7",
      hasMemoryProvenance: false,
    }).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const headers = { authorization: `Bearer ${token}` };

    const initialResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages`,
      headers,
    });
    __jait_capture(0, (initialResponse.statusCode));
    __jait_capture(1, (initialResponse.body));
    __jait_capture(2, (initialResponse.json()));

    const olderResponse = await app.inject({
      method: "GET",
      url: `/api/sessions/${session.id}/messages?limit=3&before=3`,
      headers,
    });
    __jait_capture(3, (olderResponse.statusCode));
    __jait_capture(4, (olderResponse.json()));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_150_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("streaming-history-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Streaming History" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const createdAt = (index: number) => new Date(Date.UTC(2026, 7, 1, 0, 0, index)).toISOString();

    db.insert(messages).values(Array.from({ length: 9 }, (_, index) => ({
      id: `stream-message-${index}`,
      sessionId: session.id,
      role: index % 2 === 0 ? "user" : "assistant",
      content: `stream-content-${index}`,
      contextFlow: index === 2
        ? JSON.stringify({ provider: "test", model: "test", rounds: [] })
        : null,
      createdAt: createdAt(index),
    }))).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const headers = { authorization: `Bearer ${token}` };
    __chatTestUtils.sessionHistory.set(session.id, [
      { role: "system", content: "compacted system" },
      { role: "user", content: "stream-content-8" },
    ]);
    __chatTestUtils.activeStreams.add(session.id);
    __chatTestUtils.getOrCreateAccumulator(session.id).content = "live assistant";

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers,
      });

      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (response.json()));

      const olderResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages?limit=5&before=5`,
        headers,
      });
      __jait_capture(2, (olderResponse.json()));

      const contextFlowResponse = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages/2/context-flow`,
        headers,
      });
      __jait_capture(3, (contextFlowResponse.statusCode));
      __jait_capture(4, (contextFlowResponse.json()));
    } finally {
      __chatTestUtils.activeStreams.delete(session.id);
      __chatTestUtils.sessionHistory.delete(session.id);
      __chatTestUtils.sessionStreamingState.delete(session.id);
      await app.close();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_auth_test_ts_237_3": {


const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "test",
};
async function authHeaders() {
  const token = await signAuthToken({ id: "chat-auth-user", username: "tester" }, testConfig.jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("streaming-checkpoint-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Streaming Checkpoint" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const checkpointId = "assistant-checkpoint";

    db.insert(messages).values([
      {
        id: "checkpoint-user-message",
        sessionId: session.id,
        role: "user",
        content: "continue",
        createdAt: "2026-08-01T00:00:00.000Z",
      },
      {
        id: checkpointId,
        sessionId: session.id,
        role: "assistant",
        content: "persisted partial",
        segments: JSON.stringify([{ type: "text", content: "persisted partial" }]),
        createdAt: "2026-08-01T00:00:01.000Z",
      },
    ]).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });
    const headers = { authorization: `Bearer ${token}` };
    __chatTestUtils.activeStreams.add(session.id);
    __chatTestUtils.activeAssistantCheckpointIds.set(session.id, checkpointId);
    const accumulator = __chatTestUtils.getOrCreateAccumulator(session.id);
    accumulator.content = "persisted partial plus live";
    accumulator.segments = [{ type: "text", content: "persisted partial plus live" }];

    try {
      const response = await app.inject({
        method: "GET",
        url: `/api/sessions/${session.id}/messages`,
        headers,
      });

      __jait_capture(0, (response.statusCode));
      __jait_capture(1, (response.json()));
    } finally {
      __chatTestUtils.activeStreams.delete(session.id);
      __chatTestUtils.activeAssistantCheckpointIds.delete(session.id);
      __chatTestUtils.sessionHistory.delete(session.id);
      __chatTestUtils.sessionStreamingState.delete(session.id);
      await app.close();
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
