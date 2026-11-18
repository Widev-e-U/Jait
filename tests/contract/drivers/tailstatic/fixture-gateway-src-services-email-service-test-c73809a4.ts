// Translated fixture from packages/gateway/src/services/email/service.test.ts; expected literals are in tail_static.rs.
import { GmailClient } from "../../../../packages/gateway/src/services/email/gmail.js";
import { ImapMailboxClient } from "../../../../packages/gateway/src/services/email/imap.js";
import { userSecrets } from "../../../../packages/gateway/src/db/schema.js";
import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { UserSecretService } from "../../../../packages/gateway/src/services/user-secrets.js";
import { EmailService } from "../../../../packages/gateway/src/services/email/service.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/email/service.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_email_service_test_ts_32_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    __jait_capture(0, (service.configuredProviders("u1")));
    service.saveAppCredentials("u1", "gmail", { clientId: "cid", clientSecret: "secret" });
    __jait_capture(1, (service.configuredProviders("u1")));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_38_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    process.env["GMAIL_OAUTH_CLIENT_ID"] = "env-id";
    process.env["GMAIL_OAUTH_CLIENT_SECRET"] = "env-secret";
    __jait_capture(0, (service.resolveCredentials("gmail", "u1")));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_44_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    __jait_thrown(0, () => service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://x/cb" }));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_49_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    service.saveAppCredentials("u1", "gmail", { clientId: "cid", clientSecret: "secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://x/cb" });
    const url = new URL(authUrl);
    __jait_capture(0, (url.origin + url.pathname));
    __jait_capture(1, (url.searchParams.get("client_id")));
    __jait_capture(2, (url.searchParams.get("code_challenge_method")));
    __jait_capture(3, (url.searchParams.get("redirect_uri")));
    __jait_captureType(4, (url.searchParams.get("state")));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_60_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    await __jait_rejected(0, service.completeConnect({ code: "c", state: "nope" }));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_64_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    // Seed an account row + token secret the way completeConnect would.
    const account = (service as unknown as {
      upsertAccount: (u: string, p: string, e: string) => { id: string };
    }).upsertAccount("u1", "gmail", "me@gmail.com");
    (service as unknown as {
      storeTokens: (id: string, u: string, t: unknown) => void;
    }).storeTokens(account.id, "u1", { accessToken: "a", refreshToken: "r", expiresAt: Date.now() + 1e6 });

    __jait_capture(0, (service.listAccounts("u1")));
    __jait_capture(1, (secrets.list("u1", "email-account")));

    __jait_capture(2, (service.disconnect("u1", account.id)));
    __jait_capture(3, (service.listAccounts("u1")));
    __jait_capture(4, (secrets.list("u1", "email-account")));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_81_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    (service as unknown as { upsertAccount: (u: string, p: string, e: string) => unknown }).upsertAccount("u1", "gmail", "a@gmail.com");
    (service as unknown as { upsertAccount: (u: string, p: string, e: string) => unknown }).upsertAccount("u2", "gmail", "b@gmail.com");
    __jait_capture(0, (service.listAccounts("u1").map((a) => a.email)));
    __jait_capture(1, (service.listAccounts("u2").map((a) => a.email)));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_99_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    const personal = seedMailbox("u1", "personal@gmail.com");
    const work = seedMailbox("u1", "work@gmail.com");
    __jait_capture(0, (service.listAccounts("u1")));
    __jait_capture(1, (service.resolveAccount("u1", personal.id).email));
    __jait_capture(2, (service.resolveAccount("u1", work.id).email));
    __jait_thrown(3, () => service.resolveAccount("u1"));
    __jait_thrown(4, () => service.resolveAccount("u2", personal.id));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_108_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    const first = seedMailbox("u1", "first@gmail.com");
    const second = seedMailbox("u1", "second@gmail.com");
    service.updateAccount("u1", first.id, { signature: "Alice\nPersonal" });
    service.updateAccount("u1", second.id, { signature: "Alice\nWork" });
    const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
    await service.sendMessage("u1", first.id, { to: "to@example.com", subject: "Hi", body: "Hello" });
    __jait_capture(0, (send.mock.calls[0][1].body));
    await service.sendMessage("u1", second.id, { to: "to@example.com", subject: "Re: Hi", body: "Reply", replyToMessageId: "original" });
    __jait_capture(1, (send.mock.calls[1][1]));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_119_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    const account = seedMailbox("u1", "me@gmail.com");
    service.updateAccount("u1", account.id, { signature: '<img src=x onerror="bad()"> & team' });
    const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "<p>Hi</p>", html: true });
    __jait_capture(0, (send.mock.calls[0][1].body));
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "Hello", includeSignature: false });
    __jait_capture(1, (send.mock.calls[1][1].body));
    service.updateAccount("u1", account.id, { signatureEnabled: false });
    await service.sendMessage("u1", account.id, { to: "to@example.com", subject: "Hi", body: "Hello" });
    __jait_capture(2, (send.mock.calls[2][1].body));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_131_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    const account = seedMailbox("u1", "me@gmail.com");
    __jait_thrown(0, () => service.updateAccount("u2", account.id, { signature: "Intruder" }));
    service.updateAccount("u1", account.id, { signature: "Private signature" });
    __jait_capture(1, (service.getAccount("u1", account.id)?.signature));
    __jait_capture(2, (JSON.stringify(db.select().from(userSecrets).all())));
    service.disconnect("u1", account.id);
    __jait_capture(3, (secrets.list("u1", "email-account-settings")));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_140_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_567();
try {
await (async()=>{

    const verify = vi.spyOn(ImapMailboxClient.prototype, "verify").mockResolvedValue();
    const config = { email: "me@example.com", imap: { host: "imap.example.com", port: 993, secure: true, user: "me", password: "private-mail-password" }, smtp: { host: "smtp.example.com", port: 465, secure: true, user: "me", password: "private-smtp-password" } };
    const account = await service.connectMailbox("u1", config);
    __jait_capture(0, (verify.mock.calls));
    __jait_capture(1, (account.provider));
    __jait_capture(2, (JSON.stringify(service.listAccounts("u1"))));
    __jait_capture(3, (JSON.stringify(db.select().from(userSecrets).all())));
    const stored = secrets.getValue("u1", "email-account", account.id);
    verify.mockRejectedValue(new Error("authentication failed"));
    await __jait_rejected(4, service.connectMailbox("u1", { ...config, imap: { ...config.imap, password: "wrong" } }));
    __jait_capture(5, (secrets.getValue("u1", "email-account", account.id)), (stored));
  
})();

} finally {
await __jait_hook_912();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_155_1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
await __jait_hook_567();
try {
await (async()=>{

  const account = seedMailbox("u1", "me@gmail.com");
  const send = vi.spyOn(GmailClient.prototype, "sendMessage").mockResolvedValue({ id: "sent" });
  await __jait_rejected(0, service.sendMessage("u1", account.id, { to: "person@example.com", subject: "Hello\r\nBcc: victim@example.com", body: "Text" }));
  await __jait_rejected(1, service.sendMessage("u1", account.id, { to: "person@example.com", subject: "Hello", body: "Text", html: "true" as unknown as boolean }));
  __jait_capture(2, (send.mock.calls));

})();

} finally {
await __jait_hook_912();
}


break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_163_1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
await __jait_hook_567();
try {
await (async()=>{

  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_expired_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", "gmail", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://fixture.invalid/callback" });
    const state = new URL(authUrl).searchParams.get("state")!;
    vi.setSystemTime(new Date(started.getTime() + 10 * 60_000 + 1));
    await __jait_rejected(0, service.completeConnect({ code: "synthetic-code", state }));
    vi.setSystemTime(started);
    await __jait_rejected(1, service.completeConnect({ code: "synthetic-code", state }));
    __jait_capture(2, (fetchMock.mock.calls));
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }

})();

} finally {
await __jait_hook_912();
}


break;
}
case "tailstatic_packages_gateway_src_services_email_service_test_ts_184_1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: EmailService;
function seedMailbox(owner: string, address: string) {
  const internal = service as unknown as {
    upsertAccount(owner: string, provider: string, email: string): { id: string };
    storeTokens(id: string, owner: string, tokens: unknown): void;
  };
  const account = internal.upsertAccount(owner, "gmail", address);
  internal.storeTokens(account.id, owner, { accessToken: "test-access-token", refreshToken: "refresh-token", expiresAt: Date.now() + 1e6 });
  return account;
}
const __jait_hook_567 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new EmailService(db, secrets);
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_912 = () => {
  vi.restoreAllMocks();
  sqlite.close();
};
await __jait_hook_567();
try {
await (async()=>{

  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_boundary_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", "gmail", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", provider: "gmail", redirectUri: "http://fixture.invalid/callback" });
    const state = new URL(authUrl).searchParams.get("state")!;
    vi.setSystemTime(new Date(started.getTime() + 10 * 60_000));
    await __jait_rejected(0, service.completeConnect({ code: "synthetic-code", state }));
    await __jait_rejected(1, service.completeConnect({ code: "synthetic-code", state }));
    __jait_capture(2, (fetchMock.mock.calls));
  } finally {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  }

})();

} finally {
await __jait_hook_912();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
