// Translated fixture from packages/gateway/src/routes/chat-ollama-e2e.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { openDatabase, migrateDatabase } from "../../../../packages/gateway/src/db/index.js";
import { SessionService } from "../../../../packages/gateway/src/services/sessions.js";
import { SessionStateService } from "../../../../packages/gateway/src/services/session-state.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/chat-ollama-e2e.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_89_3": {


const OLLAMA_URL = process.env["OLLAMA_E2E_URL"] || "http://localhost:11434";
const OLLAMA_MODEL = process.env["OLLAMA_E2E_MODEL"] || "gemma4:26b";
const skip =
  !process.env["OLLAMA_E2E"] || !!process.env["CI"] || !!process.env["SKIP_OLLAMA_E2E"];
/*__jait_source_gate__ skipIf skip */
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let token: string;
let sessionId: string;
const __jait_hook_1403 = async () => {
    // Verify Ollama is reachable before setting up the server
    try {
      const ping = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ping.ok) throw new Error(`Ollama returned ${ping.status}`);
    } catch (err) {
      throw new Error(`Ollama not reachable at ${OLLAMA_URL}: ${err}`);
    }

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl: OLLAMA_URL,
      ollamaModel: OLLAMA_MODEL,
      jwtSecret: "ollama-e2e-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("ollama-test", "password123");
    const session = sessionService.create({ userId: user.id, name: "Ollama E2E" });
    sessionId = session.id;

    // Set the user's backend to ollama so the chat route picks the right path
    userService.updateSettings(user.id, {
      jaitBackend: "ollama",
      apiKeys: {
        OLLAMA_URL,
        OLLAMA_MODEL,
      },
    });

    token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });
  };
const __jait_hook_2940 = async () => {
    // Don't close between tests — reuse the same server
  };
const __jait_hook_3060 = () => {};
await __jait_hook_1403();
try {
await (async()=>{

    const response = await app!.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        content: "Reply with exactly one word: hello",
      }),
    });

    __jait_capture(0, (response.statusCode));

    const body = response.body;
    const lines = body.split("\n").filter((l: string) => l.startsWith("data: "));
    const events = lines.map((l: string) => JSON.parse(l.slice(6)));
    const tokenEvents = events.filter((e: { type: string }) => e.type === "token");
    const doneEvents = events.filter((e: { type: string }) => e.type === "done");
    const thinkingEvents = events.filter((e: { type: string }) => e.type === "thinking");

    console.log(`  Thinking chunks: ${thinkingEvents.length}`);
    console.log(`  Token chunks: ${tokenEvents.length}`);
    console.log(`  Full response: ${tokenEvents.map((e: { content: string }) => e.content).join("")}`);

    __jait_capture(1, (tokenEvents.length));
    __jait_capture(2, (doneEvents.length));

    const fullText = tokenEvents.map((e: { content: string }) => e.content).join("");
    __jait_capture(3, (fullText.length));
  
})();

} finally {
await __jait_hook_3060();
await __jait_hook_2940();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_123_3": {


const OLLAMA_URL = process.env["OLLAMA_E2E_URL"] || "http://localhost:11434";
const OLLAMA_MODEL = process.env["OLLAMA_E2E_MODEL"] || "gemma4:26b";
const skip =
  !process.env["OLLAMA_E2E"] || !!process.env["CI"] || !!process.env["SKIP_OLLAMA_E2E"];
/*__jait_source_gate__ skipIf skip */
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let token: string;
let sessionId: string;
const __jait_hook_1403 = async () => {
    // Verify Ollama is reachable before setting up the server
    try {
      const ping = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ping.ok) throw new Error(`Ollama returned ${ping.status}`);
    } catch (err) {
      throw new Error(`Ollama not reachable at ${OLLAMA_URL}: ${err}`);
    }

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl: OLLAMA_URL,
      ollamaModel: OLLAMA_MODEL,
      jwtSecret: "ollama-e2e-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("ollama-test", "password123");
    const session = sessionService.create({ userId: user.id, name: "Ollama E2E" });
    sessionId = session.id;

    // Set the user's backend to ollama so the chat route picks the right path
    userService.updateSettings(user.id, {
      jaitBackend: "ollama",
      apiKeys: {
        OLLAMA_URL,
        OLLAMA_MODEL,
      },
    });

    token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });
  };
const __jait_hook_2940 = async () => {
    // Don't close between tests — reuse the same server
  };
const __jait_hook_3060 = () => {};
await __jait_hook_1403();
try {
await (async()=>{

    const response = await app!.inject({
      method: "POST",
      url: "/api/chat",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        session_id: sessionId,
        content: "What is 2+2? Reply with just the number.",
      }),
    });

    __jait_capture(0, (response.statusCode));

    const body = response.body;
    const lines = body.split("\n").filter((l: string) => l.startsWith("data: "));
    const events = lines.map((l: string) => JSON.parse(l.slice(6)));

    const thinkingEvents = events.filter((e: { type: string }) => e.type === "thinking");
    const tokenEvents = events.filter((e: { type: string }) => e.type === "token");

    console.log(`  Thinking chunks: ${thinkingEvents.length}`);
    console.log(`  Thinking: ${thinkingEvents.map((e: { content: string }) => e.content).join("").slice(0, 200)}...`);
    console.log(`  Response: ${tokenEvents.map((e: { content: string }) => e.content).join("")}`);

    __jait_capture(1, (tokenEvents.length));

    const fullText = tokenEvents.map((e: { content: string }) => e.content).join("");
    __jait_capture(2, (fullText));

    // Some Ollama installs expose reasoning as separate thinking events,
    // while others only return the final token stream.
    if (thinkingEvents.length > 0) {
      const thinkingText = thinkingEvents.map((e: { content: string }) => e.content).join("");
      __jait_capture(3, (thinkingText.length));
    }
  
})();

} finally {
await __jait_hook_3060();
await __jait_hook_2940();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_chat_ollama_e2e_test_ts_164_3": {


const OLLAMA_URL = process.env["OLLAMA_E2E_URL"] || "http://localhost:11434";
const OLLAMA_MODEL = process.env["OLLAMA_E2E_MODEL"] || "gemma4:26b";
const skip =
  !process.env["OLLAMA_E2E"] || !!process.env["CI"] || !!process.env["SKIP_OLLAMA_E2E"];
/*__jait_source_gate__ skipIf skip */
/*__jait_scope_open__*/{
let app: Awaited<ReturnType<typeof createServer>> | null = null;
let token: string;
let sessionId: string;
const __jait_hook_1403 = async () => {
    // Verify Ollama is reachable before setting up the server
    try {
      const ping = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(5000) });
      if (!ping.ok) throw new Error(`Ollama returned ${ping.status}`);
    } catch (err) {
      throw new Error(`Ollama not reachable at ${OLLAMA_URL}: ${err}`);
    }

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);

    const config = {
      ...loadConfig(),
      port: 0,
      wsPort: 0,
      logLevel: "silent" as const,
      nodeEnv: "test",
      llmProvider: "ollama" as const,
      ollamaUrl: OLLAMA_URL,
      ollamaModel: OLLAMA_MODEL,
      jwtSecret: "ollama-e2e-secret",
    };

    const sessionService = new SessionService(db);
    const sessionState = new SessionStateService(db);
    const userService = new UserService(db);
    const user = userService.createUser("ollama-test", "password123");
    const session = sessionService.create({ userId: user.id, name: "Ollama E2E" });
    sessionId = session.id;

    // Set the user's backend to ollama so the chat route picks the right path
    userService.updateSettings(user.id, {
      jaitBackend: "ollama",
      apiKeys: {
        OLLAMA_URL,
        OLLAMA_MODEL,
      },
    });

    token = await signAuthToken({ id: user.id, username: user.username }, config.jwtSecret);

    app = await createServer(config, {
      db,
      sqlite,
      sessionService,
      sessionState,
      userService,
    });
  };
const __jait_hook_2940 = async () => {
    // Don't close between tests — reuse the same server
  };
const __jait_hook_3060 = () => {};
await __jait_hook_1403();
try {
await (async()=>{

    await app?.close();
    app = null;
  
})();
__jait_record({slot:0,completed:true});
} finally {
await __jait_hook_3060();
await __jait_hook_2940();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
