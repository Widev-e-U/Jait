// Translated fixture from packages/gateway/src/services/calendar/service.test.ts; expected literals are in tail_static.rs.
import { migrateDatabase, openDatabase, type JaitDB } from "../../../../packages/gateway/src/db/connection.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import { UserSecretService } from "../../../../packages/gateway/src/services/user-secrets.js";
import { CalendarService } from "../../../../packages/gateway/src/services/calendar/service.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/calendar/service.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_30_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    __jait_capture(0, (service.isConfigured("u1")));
    service.saveAppCredentials("u1", { clientId: "calendar-id", clientSecret: "calendar-secret" });
    __jait_capture(1, (service.isConfigured("u1")));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_36_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    secrets.save({
      userId: "u1",
      type: "email-oauth-app",
      key: "gmail-client-id",
      label: "Gmail client id",
      value: "gmail-id",
    });
    secrets.save({
      userId: "u1",
      type: "email-oauth-app",
      key: "gmail-client-secret",
      label: "Gmail client secret",
      value: "gmail-secret",
    });
    __jait_capture(0, (service.resolveCredentials("u1")));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_54_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    service.saveAppCredentials("u1", { clientId: "calendar-id", clientSecret: "calendar-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", redirectUri: "https://jait.test/api/calendar/oauth/callback" });
    const url = new URL(authUrl);
    __jait_capture(0, (url.origin + url.pathname));
    __jait_capture(1, (url.searchParams.get("client_id")));
    __jait_capture(2, (url.searchParams.get("scope")));
    __jait_capture(3, (url.searchParams.get("scope")));
    __jait_capture(4, (url.searchParams.get("code_challenge_method")));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_65_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    await __jait_rejected(0, service.completeConnect({ code: "code", state: "unknown" }));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_69_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const privateService = service as unknown as {
      upsertAccount: (userId: string, email: string) => { id: string };
      storeTokens: (accountId: string, userId: string, tokens: unknown) => void;
    };
    const first = privateService.upsertAccount("u1", "one@example.com");
    privateService.upsertAccount("u2", "two@example.com");
    privateService.storeTokens(first.id, "u1", {
      accessToken: "access",
      refreshToken: "refresh",
      expiresAt: Date.now() + 60_000,
    });

    __jait_capture(0, (service.listAccounts("u1").map((account) => account.email)));
    __jait_capture(1, (service.listAccounts("u2").map((account) => account.email)));
    __jait_capture(2, (secrets.list("u1", "calendar-account")));
    __jait_capture(3, (service.disconnect("u1", first.id)));
    __jait_capture(4, (service.listAccounts("u1")));
    __jait_capture(5, (secrets.list("u1", "calendar-account")));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_90_3": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
/*__jait_scope_open__*/{
await __jait_hook_434();
try {
await (async()=>{

    const account = service.syncDeviceCalendar("u1", {
      deviceId: "phone-1",
      deviceName: "Samsung Galaxy",
      calendars: [{
        id: "7",
        name: "Samsung Calendar",
        description: "com.samsung.android.calendar",
        timeZone: "Europe/Berlin",
        primary: true,
        selected: true,
        accessRole: "reader",
      }],
      events: [{
        id: "event-1",
        calendarId: "7",
        calendarName: "Samsung Calendar",
        title: "Early shift",
        description: "",
        location: "Office",
        start: "2026-08-02T05:00:00.000Z",
        end: "2026-08-02T13:00:00.000Z",
        allDay: false,
        status: "confirmed",
        organizer: "",
        attendees: [],
      }],
    });

    __jait_capture(0, (account));
    await __jait_captureResolved(1, (service.listCalendars("u1", account.id)));
    await __jait_captureResolved(2, (service.listEvents("u1", account.id, {
      timeMin: "2026-08-01T00:00:00.000Z",
      timeMax: "2026-08-03T00:00:00.000Z",
      query: "office",
    })));
    __jait_capture(3, (service.disconnect("u1", account.id)));
    __jait_capture(4, (service.listAccounts("u1")));
  
})();

} finally {
await __jait_hook_900();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_135_1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
await __jait_hook_434();
try {
await (async()=>{

  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_expired_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", redirectUri: "http://fixture.invalid/callback" });
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
await __jait_hook_900();
}


break;
}
case "tailstatic_packages_gateway_src_services_calendar_service_test_ts_156_1": {


let sqlite: SqliteDatabase;
let db: JaitDB;
let secrets: UserSecretService;
let service: CalendarService;
const __jait_hook_434 = async () => {
  const opened = await openDatabase(":memory:");
  sqlite = opened.sqlite;
  db = opened.db;
  migrateDatabase(sqlite);
  secrets = new UserSecretService(db, "test-secret");
  service = new CalendarService(db, secrets);
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_ID"];
  delete process.env["GOOGLE_CALENDAR_OAUTH_CLIENT_SECRET"];
  delete process.env["GMAIL_OAUTH_CLIENT_ID"];
  delete process.env["GMAIL_OAUTH_CLIENT_SECRET"];
};
const __jait_hook_900 = () => {
  sqlite.close();
};
await __jait_hook_434();
try {
await (async()=>{

  vi.useFakeTimers({ toFake: ["Date"] });
  const started = new Date("2026-10-20T12:00:00.000Z");
  const fetchMock = vi.fn(async () => Response.json({ error: "synthetic_boundary_fixture" }, { status: 400 }));
  vi.stubGlobal("fetch", fetchMock);
  try {
    vi.setSystemTime(started);
    service.saveAppCredentials("u1", { clientId: "synthetic-client", clientSecret: "synthetic-secret" });
    const { authUrl } = service.startConnect({ userId: "u1", redirectUri: "http://fixture.invalid/callback" });
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
await __jait_hook_900();
}


break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
