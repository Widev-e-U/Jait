// Translated fixture from packages/gateway/src/routes/provider-accounts.test.ts; expected literals are in tail_static.rs.

import { mkdtempSync, rmSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { migrateDatabase, openDatabase } from "../../../../packages/gateway/src/db/index.js";
import { ProviderRegistry } from "../../../../packages/gateway/src/providers/registry.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { ProviderAccountService } from "../../../../packages/gateway/src/services/provider-accounts.js";
import { UserService } from "../../../../packages/gateway/src/services/users.js";
import { registerProviderRoutes } from "../../../../packages/gateway/src/routes/providers.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/provider-accounts.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_provider_accounts_test_ts_20_3": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string, username: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { db, sqlite } = await openDatabase(":memory:");
    migrateDatabase(sqlite);
    const config = { ...loadConfig(), jwtSecret: "provider-account-test", logLevel: "silent" };
    const users = new UserService(db);
    const firstUser = users.createUser("first-user", "password123");
    const secondUser = users.createUser("second-user", "password123");
    const registry = new ProviderRegistry();
    const root = mkdtempSync(join(__jait_fixture_dir, "jait-provider-route-"));
    const accounts = new ProviderAccountService(db, registry, [
      {
        id: "codex",
        name: "Codex",
        description: "Codex test provider",
        command: process.execPath,
      },
      {
        id: "claude-code",
        name: "Claude Code",
        description: "Claude Code test provider",
        command: process.execPath,
      },
    ], root);
    const app = Fastify({ logger: false });
    registerProviderRoutes(app, config, {
      providerRegistry: registry,
      providerAccountService: accounts,
      userService: users,
    });

    const firstHeaders = await authHeader(config.jwtSecret, firstUser.id, firstUser.username);
    const secondHeaders = await authHeader(config.jwtSecret, secondUser.id, secondUser.username);
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/provider-accounts",
      headers: firstHeaders,
      payload: { providerType: "codex", label: "Work" },
    });

    __jait_capture(0, (createdResponse.statusCode));
    const accountId = createdResponse.json().account.id as string;
    __jait_captureType(1, (registry.getForUser(accountId, firstUser.id)));
    __jait_captureType(2, (registry.getForUser(accountId, secondUser.id)));

    const firstList = await app.inject({ method: "GET", url: "/api/provider-accounts", headers: firstHeaders });
    const secondList = await app.inject({ method: "GET", url: "/api/provider-accounts", headers: secondHeaders });
    __jait_capture(3, (firstList.json().accounts));
    __jait_capture(4, (secondList.json().accounts));
    __jait_capture(5, (firstList.json().providerTypes));

    const forbiddenDelete = await app.inject({
      method: "DELETE",
      url: `/api/provider-accounts/${accountId}`,
      headers: secondHeaders,
    });
    __jait_capture(6, (forbiddenDelete.statusCode));
    __jait_captureType(7, (registry.get(accountId)));

    const deleted = await app.inject({
      method: "DELETE",
      url: `/api/provider-accounts/${accountId}`,
      headers: firstHeaders,
    });
    __jait_capture(8, (deleted.statusCode));
    __jait_captureType(9, (registry.get(accountId)));

    await app.close();
    sqlite.close();
    rmSync(root, { recursive: true, force: true });
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_routes_provider_accounts_test_ts_95_1": {

const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
async function authHeader(jwtSecret: string, userId: string, username: string) {
  const token = await signAuthToken({ id: userId, username }, jwtSecret);
  return { authorization: `Bearer ${token}` };
}

try {
await (async()=>{

  const {db, sqlite} = await openDatabase(":memory:"); migrateDatabase(sqlite);
  const config = {...loadConfig(), jwtSecret: "go-test", logLevel: "silent"};
  const users = new UserService(db);
  const owner = users.createUser("go-owner", "password123");
  const other = users.createUser("go-other", "password123");
  const registry = new ProviderRegistry();
  const root = mkdtempSync(join(__jait_fixture_dir, "jait-go-"));
  const accounts = new ProviderAccountService(db, registry, [{id: "opencode", name: "OpenCode", description: "test", command: process.execPath}], root);
  const account = accounts.create(owner.id, "opencode", "Privat");
  const app = Fastify({logger: false});
  registerProviderRoutes(app, config, {providerRegistry: registry, providerAccountService: accounts, userService: users});
  try {
    const url = `/api/provider-accounts/${account.id}/opencode-go`;
    const forbidden = await app.inject({method: "POST", url, headers: await authHeader(config.jwtSecret, other.id, other.username), payload: {apiKey: "go-secret"}});
    __jait_capture(0, (forbidden.statusCode));
    const connected = await app.inject({method: "POST", url, headers: await authHeader(config.jwtSecret, owner.id, owner.username), payload: {apiKey: "go-secret"}});
    __jait_capture(1, (connected.statusCode));
    __jait_capture(2, (connected.body));
    const path = join(root, account.id, ".local/share/opencode/auth.json");
    __jait_capture(3, (JSON.parse(readFileSync(path, "utf8"))["opencode-go"]));
    __jait_capture(4, (statSync(path).mode & 0o777));
    const invalid = await app.inject({method: "POST", url, headers: await authHeader(config.jwtSecret, owner.id, owner.username), payload: {apiKey: ""}});
    __jait_capture(5, (invalid.statusCode));
    __jait_capture(6, (JSON.parse(readFileSync(path, "utf8"))["opencode-go"].key));
  } finally { await app.close(); sqlite.close(); rmSync(root, {recursive: true, force: true}); }

})();

} finally {

}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
