// Translated fixture from packages/gateway/src/services/attention.test.ts; expected literals are in tail_static.rs.
import type { ClientSurface, WsControlPlane } from "../../../../packages/gateway/src/ws.js";
import {
  AttentionService,
  attentionActionsForQuestion,
  shouldNotifyNatively,
  type AttentionCleared,
  type AttentionItem,
  type AttentionRaisedPayload,
} from "../../../../packages/gateway/src/services/attention.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/attention.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_attention_test_ts_44_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws);
    __jait_capture(0, (service.raise(baseItem).key));
    __jait_capture(1, (service.raise({ ...baseItem, kind: "question" }).key));
    __jait_capture(2, (service.list()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_52_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws);
    service.raise(baseItem);
    service.raise({ ...baseItem, body: "updated summary" });
    __jait_capture(0, (service.list()));
    __jait_capture(1, (service.get("consent:req-1")?.body));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_61_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, raised } = makeWs();
    const service = new AttentionService(ws, { resolveUserId: () => "user-a" });
    __jait_capture(0, (service.raise(baseItem).userId));
    __jait_capture(1, (raised.map((entry) => entry.userId)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_68_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, raised } = makeWs();
    new AttentionService(ws).raise(baseItem);
    __jait_capture(0, (raised.map((entry) => entry.userId)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_74_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, raised } = makeWs(["desktop", "web", "mobile"]);
    new AttentionService(ws).raise(baseItem);
    __jait_capture(0, (raised.map((entry) => entry.payload.native)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_80_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws, raised } = makeWs(["web", "mobile"]);
    new AttentionService(ws).raise(baseItem);
    __jait_capture(0, (raised.every((entry) => entry.payload.native)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_86_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws, { resolveUserId: () => "user-a" });
    const cleared: AttentionCleared[] = [];
    service.addSink({ raised: () => {}, cleared: (event) => { cleared.push(event); } });

    service.raise(baseItem);
    const event = service.clear("consent", "req-1", "answered", "android-primary");

    __jait_capture(0, (event?.resolvedBy));
    __jait_capture(1, (service.list()));
    __jait_capture(2, (cleared));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_102_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws);
    const cleared = vi.fn();
    service.addSink({ raised: () => {}, cleared });

    service.raise(baseItem);
    __jait_captureType(0, (service.clear("consent", "req-1", "answered")));
    // The watch answering just as the request times out must not double-revoke.
    __jait_captureType(1, (service.clear("consent", "req-1", "timeout")));
    __jait_capture(2, (cleared.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_115_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws);
    const raised: AttentionItem[] = [];
    service.addSink({ raised: () => { throw new Error("dead transport"); }, cleared: () => {} });
    service.addSink({ raised: (item) => { raised.push(item); }, cleared: () => {} });

    __jait_thrown(0, () => service.raise(baseItem));
    __jait_capture(1, (raised));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_126_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { ws } = makeWs();
    const service = new AttentionService(ws);
    service.raise({ ...baseItem, userId: "user-a" });
    service.raise({ ...baseItem, requestId: "req-2", userId: "user-b" });
    __jait_capture(0, (service.list("user-a").map((item) => item.key)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_136_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const withDesktop = new Set<ClientSurface>(["desktop", "web", "mobile", "unknown"]);
    __jait_capture(0, (shouldNotifyNatively("web", withDesktop)));
    __jait_capture(1, (shouldNotifyNatively("desktop", withDesktop)));
    // The phone and watch are separate devices — the PC being awake says
    // nothing about whether the user is looking at it.
    __jait_capture(2, (shouldNotifyNatively("mobile", withDesktop)));
    __jait_capture(3, (shouldNotifyNatively("unknown", withDesktop)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_148_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (attentionActionsForQuestion({
      questions: [{
        id: "q1",
        options: [{ label: "Yes" }, { label: "No" }, { label: "Later" }, { label: "Never" }],
      }],
    })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_161_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (attentionActionsForQuestion({
      questions: [{ id: "q1", allowFreeformInput: true }],
    })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_attention_test_ts_167_3": {


function makeWs(surfaces: ClientSurface[] = ["web"]) {
  const all: unknown[] = [];
  const perUser: Array<{ userId: string; event: unknown }> = [];
  const raised: Array<{ userId: string | null; payload: AttentionRaisedPayload }> = [];
  const ws = {
    broadcastAll: (event: unknown) => { all.push(event); },
    broadcastToUser: (userId: string, event: unknown) => { perUser.push({ userId, event }); },
    liveSurfaces: () => new Set(surfaces),
    broadcastBySurface: (
      userId: string | null,
      build: (surface: ClientSurface) => { payload: AttentionRaisedPayload },
    ) => {
      for (const surface of surfaces) raised.push({ userId, payload: build(surface).payload });
    },
  } as unknown as WsControlPlane;
  return { ws, all, perUser, raised };
}
const baseItem = {
  kind: "consent" as const,
  requestId: "req-1",
  sessionId: "session-1",
  title: "Approval needed",
  body: "terminal.run wants to run.",
  urgent: true,
  actions: [],
  link: "/?session=session-1",
  expiresAt: new Date(Date.now() + 120_000).toISOString(),
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (attentionActionsForQuestion({
      questions: [{ id: "q1", multiSelect: true, options: [{ label: "a" }] }],
    })));
    __jait_capture(1, (attentionActionsForQuestion({
      questions: [{ id: "q1", options: [{ label: "a" }] }, { id: "q2" }],
    })));
  
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
