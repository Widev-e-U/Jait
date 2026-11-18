// Translated fixture from packages/gateway/src/routes/chat-restart.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { messages } from "../../../../packages/gateway/src/db/schema.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";

import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-restart.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_21_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-stale-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Stale Restart" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "original", createdAt: now.toISOString() },
      { id: "m2", sessionId: session.id, role: "assistant", content: "answer", createdAt: new Date(now.getTime() + 1).toISOString() },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: {
        messageId: `${session.id}-0`,
        expectedContent: "content no longer present in this session",
      },
    });

    __jait_capture(0, (response.statusCode));
    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(1, (remaining.map((row) => row.id)));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_66_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "used a tool", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "tool", content: "{\"ok\":true}", createdAt: at(3) },
      { id: "m4", sessionId: session.id, role: "user", content: "second", createdAt: at(4) },
      { id: "m5", sessionId: session.id, role: "assistant", content: "answer", createdAt: at(5) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageId: `${session.id}-2` },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(2, (remaining.map((row) => row.id)));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_120_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user2", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 2" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    // Production layout: tool messages live only in memory (not persisted), so
    // the DB holds only user + assistant rows.
    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "used a tool", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "user", content: "second", createdAt: at(4) },
      { id: "m4", sessionId: session.id, role: "assistant", content: "answer", createdAt: at(5) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    // Restart from the SECOND user message ("second"), addressed by
    // messageFromEnd (the way the frontend locates it after a completed turn).
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 1 },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    // The edited user message ("second") and its answer must be gone from the DB
    // so they don't reappear on the next snapshot reload.
    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(2, (remaining.map((row) => row.id)));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_179_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user3", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 3" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "assistant", content: "a1", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "user", content: "second", createdAt: at(3) },
      { id: "m4", sessionId: session.id, role: "assistant", content: "a2", createdAt: at(4) },
      { id: "m5", sessionId: session.id, role: "user", content: "third", createdAt: at(5) },
      { id: "m6", sessionId: session.id, role: "assistant", content: "a3", createdAt: at(6) },
    ]).run();

    const app = await createServer(testConfig, {
      db,
      sqlite,
      userService,
      sessionService,
    });

    // Simulates a client whose local message list is behind the server by one
    // full turn (e.g. a turn landed via another tab/background reconnect).
    // Its computed messageFromEnd for "second" (1) resolves, against the
    // server's true history, to a different valid user message ("third")
    // rather than triggering the role-mismatch fallback. Without content
    // verification this would truncate the wrong turn and leave "second"
    // and its answer behind as stale, duplicate-looking messages once the
    // client resends "second" as a new turn.
    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 1, expectedContent: "second" },
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(2, (remaining.map((row) => row.id)));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_242_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user4", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 4" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    // System-notice rows (background terminal commands) are persisted and
    // rendered, but hydration drops them from the in-memory history. Resolving
    // the edit target against that shorter list while deleting from the full
    // persisted list shifted the cut earlier by one row per notice — silently
    // destroying the previous assistant answer.
    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      { id: "m2", sessionId: session.id, role: "system", content: "build finished", createdAt: at(2) },
      { id: "m3", sessionId: session.id, role: "system", content: "tests finished", createdAt: at(3) },
      { id: "m4", sessionId: session.id, role: "assistant", content: "answer one", createdAt: at(4) },
      { id: "m5", sessionId: session.id, role: "user", content: "second", createdAt: at(5) },
      { id: "m6", sessionId: session.id, role: "assistant", content: "answer two", createdAt: at(6) },
    ]).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 1, expectedContent: "second" },
    });

    __jait_capture(0, (response.statusCode));

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(1, (remaining.map((row) => row.id)));

    await app.close();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_restart_test_ts_290_3": {

const { eq } = await import((typeof Bun!=="undefined"?Bun.resolveSync("drizzle-orm", __jait_original_dir):__jait_require.resolve("drizzle-orm")));
const testConfig = {
  ...loadConfig(),
  port: 0,
  wsPort: 0,
  logLevel: "silent" as const,
  nodeEnv: "test",
  jwtSecret: "test-jwt-secret",
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const userService = new UserService(db);
    const sessionService = new SessionService(db);
    const user = userService.createUser("restart-user5", "password123");
    const session = sessionService.create({ userId: user.id, name: "Restart Session 5" });
    const token = await signAuthToken({ id: user.id, username: user.username }, testConfig.jwtSecret);
    const now = new Date("2026-04-25T00:00:00.000Z");
    const at = (offset: number) => new Date(now.getTime() + offset).toISOString();

    // Stopping a turn before any text streams persists an assistant row that
    // carries only thinking/segments — no content and no tool calls. It is a
    // real, rendered bubble, so it occupies a slot in the client's index space;
    // excluding it from the deletion list shifted the cut one row late, leaving
    // the edited user message behind to reappear as a duplicate on reload.
    db.insert(messages).values([
      { id: "m1", sessionId: session.id, role: "user", content: "first", createdAt: at(1) },
      {
        id: "m2",
        sessionId: session.id,
        role: "assistant",
        content: "",
        segments: JSON.stringify([{ type: "thinking", content: "weighing options" }]),
        thinking: "weighing options",
        createdAt: at(2),
      },
      { id: "m3", sessionId: session.id, role: "user", content: "second", createdAt: at(3) },
    ]).run();

    const app = await createServer(testConfig, { db, sqlite, userService, sessionService });

    const response = await app.inject({
      method: "POST",
      url: `/api/sessions/${session.id}/restart-from`,
      headers: { authorization: `Bearer ${token}` },
      payload: { messageFromEnd: 0, expectedContent: "second" },
    });

    __jait_capture(0, (response.statusCode));

    const remaining = db
      .select()
      .from(messages)
      .where(eq(messages.sessionId, session.id))
      .orderBy(messages.createdAt)
      .all();
    __jait_capture(1, (remaining.map((row) => row.id)));

    await app.close();
  
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
