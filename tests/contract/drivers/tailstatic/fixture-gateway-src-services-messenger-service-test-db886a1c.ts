// Translated fixture from packages/gateway/src/services/messenger-service.test.ts; expected literals are in tail_static.rs.
import { fileURLToPath } from 'node:url';
import { MessengerService, messengerHomeserver } from "../../../../packages/gateway/src/services/messenger-service.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/messenger-service.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_18_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@alice:test', origin_server_ts: 2, content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { msgtype: 'm.text', body: 'changed' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@alice:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    __jait_capture(0, (c.messages('!room:test')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_24_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room } = setup();
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { body: 'forged' } } } as any);
    room.events.push({ event_id: '$react', type: 'm.reaction', sender: '@other:test', content: { 'm.relates_to': { rel_type: 'm.annotation', event_id: '$one', key: '👍' } } } as any);
    room.events.push({ event_id: '$redact', type: 'm.room.redaction', content: { redacts: '$react' } } as any);
    __jait_capture(0, (c.messages('!room:test')[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_31_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.events = Array.from({ length: 2000 }, (_, i) => message('$' + i));
    c.client.doRequest.mockResolvedValue({ chunk: [message('$older')], end: 'page2' });
    await c.earlier('!room:test');
    __jait_capture(0, (c.messages('!room:test')[0].id));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_38_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c } = setup();
    c.client.doRequest.mockResolvedValue({ chunk: [], end: 'page1' });
    await c.earlier('!room:test');
    await c.sync({ rooms: { join: { '!room:test': { timeline: { events: [], prev_batch: 'reset' } } } } });
    __jait_capture(0, (c.snapshot('!room:test').hasEarlier));
    await c.earlier('!room:test');
    __jait_capture(1, (c.client.doRequest.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_47_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room } = setup();
    room.events[0].sender = '@bob:test';
    await __jait_rejected(0, c.command({ action: 'edit', roomId: '!room:test', eventId: '$one', text: 'wrong' }));
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    __jait_capture(1, (c.client.sendEvent.mock.calls));
    await c.command({ action: 'react', roomId: '!room:test', eventId: '$one', key: '👍' });
    __jait_capture(2, (c.client.redactEvent.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_56_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.events = [message('$one'), message('$two'), message('$three')];
    room.receipts = {
      '$one': { '@bob:test': { ts: 100 } },
      '$two': { '@bob:test': { ts: 200 } },
      '$three': { '@bob:test': { ts: 300 } },
    } as any;
    const messages = c.messages('!room:test');
    __jait_capture(0, (messages[0].readBy));
    __jait_capture(1, (messages[2].readBy));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_68_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.events = [message('$one'), message('$two'), message('$three')];
    room.events.push({ event_id: '$redact', type: 'm.room.redaction', content: { redacts: '$one' } } as any);
    room.receipts = { '$three': { '@bob:test': { ts: 300 } } } as any;
    const messages = c.messages('!room:test');
    __jait_capture(0, (messages.map((m: any) => m.id)));
    __jait_capture(1, (messages[0].readBy));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_77_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c } = setup();
    await c.command({ action: 'remove', roomId: '!room:test' });
    __jait_capture(0, (c.client.leaveRoom.mock.calls));
    __jait_capture(1, (c.client.doRequest.mock.calls));
    __jait_capture(2, (c.snapshot().rooms));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_87_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (messengerHomeserver('https://matrix.example.org')));
    __jait_capture(1, (messengerHomeserver('  https://matrix.example.org/  ')));
    __jait_capture(2, (messengerHomeserver('https://matrix.example.org:8448/')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_93_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => messengerHomeserver('https://alice@matrix.example.org'));
    __jait_thrown(1, () => messengerHomeserver('https://alice:secret@matrix.example.org'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_98_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => messengerHomeserver('https://matrix.example.org/?access_token=abc'));
    __jait_thrown(1, () => messengerHomeserver('https://matrix.example.org/#/room'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_103_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => messengerHomeserver('https://matrix.example.org/_matrix/client'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_107_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => messengerHomeserver('http://matrix.example.org'));
    __jait_capture(1, (messengerHomeserver('http://localhost:8008')));
    __jait_capture(2, (messengerHomeserver('http://127.0.0.1:8008')));
    __jait_capture(3, (messengerHomeserver('http://[::1]:8008')));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_114_3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_thrown(0, () => messengerHomeserver('ftp://matrix.example.org'));
    __jait_thrown(1, () => messengerHomeserver('ws://matrix.example.org'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_122_3_each0": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = 'WhatsApp Status Broadcast';
const topic = '';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name } },
        { type: 'm.room.topic', state_key: '', content: { topic } },
        { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', membership: 'join' } },
      ] },
      timeline: { events: [{
        event_id: '$story', type: 'm.room.message', sender: '@bob:test', origin_server_ts: Date.now(),
        content: { msgtype: 'm.image', body: 'Evening sky', filename: 'sky.png', url: 'mxc://test/sky', info: { mimetype: 'image/png' } },
      }] },
    } } } });
    const snapshot = c.snapshot('!status:test');
    __jait_capture(0, (snapshot.rooms.find((room: any) => room.id === '!status:test')), ({ status: true, kind: 'status', topic }));
    __jait_capture(1, (snapshot.messages));

    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name: 'General chat' } },
        { type: 'm.room.topic', state_key: '', content: { topic: 'Ordinary conversation' } },
      ] }, timeline: { events: [] },
    } } } });
    const updated = c.snapshot('!status:test').rooms.find((room: any) => room.id === '!status:test');
    __jait_captureType(2, (updated.status));
    __jait_capture(3, (updated.kind));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_122_3_each1": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = 'WhatsApp';
const topic = 'Status updates from your contacts';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name } },
        { type: 'm.room.topic', state_key: '', content: { topic } },
        { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', membership: 'join' } },
      ] },
      timeline: { events: [{
        event_id: '$story', type: 'm.room.message', sender: '@bob:test', origin_server_ts: Date.now(),
        content: { msgtype: 'm.image', body: 'Evening sky', filename: 'sky.png', url: 'mxc://test/sky', info: { mimetype: 'image/png' } },
      }] },
    } } } });
    const snapshot = c.snapshot('!status:test');
    __jait_capture(0, (snapshot.rooms.find((room: any) => room.id === '!status:test')), ({ status: true, kind: 'status', topic }));
    __jait_capture(1, (snapshot.messages));

    await c.sync({ rooms: { join: { '!status:test': {
      state: { events: [
        { type: 'm.room.name', state_key: '', content: { name: 'General chat' } },
        { type: 'm.room.topic', state_key: '', content: { topic: 'Ordinary conversation' } },
      ] }, timeline: { events: [] },
    } } } });
    const updated = c.snapshot('!status:test').rooms.find((room: any) => room.id === '!status:test');
    __jait_captureType(2, (updated.status));
    __jait_capture(3, (updated.kind));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_155_3_each0": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const protocol = 'go.mau.fi/mautrix-teams';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { invite: { '!teams:test': { invite_state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'A conversation' } },
    ] } } } } });
    __jait_capture(0, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: protocol, displayname: 'Microsoft Teams' } } },
    ] }, timeline: { events: [] } } } } });
    __jait_capture(1, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_155_3_each1": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const protocol = 'msteams';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { invite: { '!teams:test': { invite_state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'A conversation' } },
    ] } } } } });
    __jait_capture(0, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: protocol, displayname: 'Microsoft Teams' } } },
    ] }, timeline: { events: [] } } } } });
    __jait_capture(1, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_155_3_each2": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const protocol = 'teams';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { invite: { '!teams:test': { invite_state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'A conversation' } },
    ] } } } } });
    __jait_capture(0, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: protocol, displayname: 'Microsoft Teams' } } },
    ] }, timeline: { events: [] } } } } });
    __jait_capture(1, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_155_3_each3": {


function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const protocol = 'microsoft-teams';

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { invite: { '!teams:test': { invite_state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'A conversation' } },
    ] } } } } });
    __jait_capture(0, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: protocol, displayname: 'Microsoft Teams' } } },
    ] }, timeline: { events: [] } } } } });
    __jait_capture(1, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test')));
  
})();

} finally {

}
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
