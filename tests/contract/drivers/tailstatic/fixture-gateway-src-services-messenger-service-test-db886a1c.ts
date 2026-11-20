// Translated fixture from packages/gateway/src/services/messenger-service.test.ts; expected literals are in tail_static.rs.
import { fileURLToPath } from 'node:url';
import { rmSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

import { MessengerBridge } from "../../../../packages/gateway/src/services/messenger-bridge.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { FileSystemSurfaceFactory } from "../../../../packages/gateway/src/surfaces/filesystem.js";
import { createMessengerTools } from "../../../../packages/gateway/src/tools/messenger-tools.js";
import { createImageViewTool } from "../../../../packages/gateway/src/tools/file-tools.js";
import { mcpContentForToolResult } from "../../../../packages/gateway/src/routes/mcp-server.js";
import { mkdirSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_29_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const directory = fileURLToPath(new URL(`../../../../.jait/artifacts/messenger-access-${randomUUID()}`, __jait_original_url));
    try {
      const service = new MessengerService('test-secret', directory);
      const connection = (service as any).connection('owner');
      connection.session = { userId: '@alice:test' };
      await connection.command({ action: 'assistantAccess', enabled: true });
      const restarted = new MessengerService('test-secret', directory);
      const restored = (restarted as any).connection('owner');
      restored.start = vi.fn(async (session: unknown) => { restored.session = session; });
      await restarted.resume('owner');
      __jait_capture(0, (restored.assistantAccess));
      await restored.command({ action: 'assistantAccess', enabled: true });
      __jait_capture(1, (restored.assistantAccess));
      const next = new MessengerService('test-secret', directory);
      const nextConnection = (next as any).connection('owner');
      nextConnection.start = vi.fn(async (session: unknown) => { nextConnection.session = session; });
      await next.resume('owner');
      __jait_capture(2, (nextConnection.assistantAccess));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_55_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, c, room, message } = setup();
    const sharp = (await import(Bun.resolveSync("sharp", __jait_original_dir))).default;
    c.client.doRequest.mockResolvedValue(await sharp({ create: { width: 300, height: 300, channels: 3, background: '#3388aa' } }).png().toBuffer());
    room.states = [{ type: 'm.room.member', state_key: '@bob:test', content: { avatar_url: 'mxc://test/bob' } }] as any;
    room.events.push(message('$avatar', '@bob:test'));
    const avatar = await service.notificationAvatar('test', '!room:test', '$avatar');
    __jait_capture(0, (await sharp(avatar).metadata()));
    await __jait_rejected(1, service.notificationAvatar('other', '!room:test', '$avatar'));
    await __jait_rejected(2, service.notificationAvatar('test', '!room:test', '$missing'));
    room.summary.hidden = true;
    await __jait_rejected(3, service.notificationAvatar('test', '!room:test', '$avatar'));
    room.summary.hidden = false;
    room.summary.membership = 'leave';
    await __jait_rejected(4, service.notificationAvatar('test', '!room:test', '$avatar'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_71_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, c, room, message } = setup();
    const sharp = (await import(Bun.resolveSync("sharp", __jait_original_dir))).default;
    const source = await sharp({ create: { width: 600, height: 400, channels: 3, background: '#c46422' } }).png().toBuffer();
    c.client.doRequest.mockResolvedValue(source);
    room.events.push(message('$photo', '@bob:test', { body: 'photo.png', msgtype: 'm.image', url: 'mxc://test/photo', info: { mimetype: 'image/png', size: source.length } } as any));
    const preview = await service.notificationImage('test', '!room:test', '$photo');
    __jait_capture(0, (preview.length), (256 * 1024));
    __jait_capture(1, (await sharp(preview).metadata()));
    await __jait_rejected(2, service.notificationImage('other', '!room:test', '$photo'));
    await __jait_rejected(3, service.notificationImage('test', '!room:test', '$one'));
    (room.summary as any).hidden = true;
    await __jait_rejected(4, service.notificationImage('test', '!room:test', '$photo'));
    (room.summary as any).hidden = false;
    room.summary.membership = 'leave';
    await __jait_rejected(5, service.notificationImage('test', '!room:test', '$photo'));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_91_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const { c, room } = setup();
      room.states = [{ type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob' } }] as any;
      const update = (user_ids: string[]) => c.sync({ rooms: { join: { '!room:test': { ephemeral: { events: [{ type: 'm.typing', content: { user_ids } }] }, timeline: { events: [] } } } } });
      await update(['@alice:test', '@bob:test']);
      __jait_capture(0, (c.snapshot('!room:test').typing));
      await update([]);
      __jait_capture(1, (c.snapshot('!room:test').typing));
      await update(['@bob:test']);
      c.connectionInterrupted();
      __jait_capture(2, (c.snapshot('!room:test').typing));
      await update(['@bob:test']);
      vi.advanceTimersByTime(15001);
      __jait_capture(3, (c.snapshot('!room:test').typing));
    } finally { vi.useRealTimers(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_110_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const { c, room } = setup();
      const notify = vi.fn();
      c.incoming = () => notify;
      room.summary = { ...room.summary, name: 'Teams bridge', service: 'Teams' } as any;
      room.states = [{ type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob' } }] as any;
      const event = { event_id: '$direct', sender: '@bob:test', type: 'm.room.message', origin_server_ts: Date.now(), content: { body: 'Hello' } };
      (room as any).peer = { userId: '@bob:test' };
      c.announce(room, event);
      await vi.advanceTimersByTimeAsync(10_000);
      __jait_capture(0, (notify.mock.calls));
      delete (room as any).peer;
      room.summary.name = 'Team-Chat';
      c.announce(room, { ...event, event_id: '$group', origin_server_ts: Date.now() });
      await vi.advanceTimersByTimeAsync(10_000);
      __jait_capture(1, (notify.mock.calls));
    } finally { vi.useRealTimers(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_131_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_137_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.states = [
      { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', avatar_url: 'mxc://test/bob' } },
      { type: 'm.room.member', state_key: '@eve:test', content: { displayname: 'Eve', avatar_url: 'https://example.test/photo' } },
    ] as any;
    room.events = [message('$bob', '@bob:test'), message('$eve', '@eve:test')];
    const messages = c.messages('!room:test');
    __jait_capture(0, (messages[0]));
    __jait_capture(1, (messages[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_148_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.states = [
      { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Bob', avatar_url: 'mxc://test/bob' } },
      { type: 'm.room.member', state_key: '@eve:test', content: { displayname: 'Eve' } },
    ] as any;
    await c.sync({ rooms: { join: { '!room:test': { timeline: { events: [message('$bob', '@bob:test')] } } } } });
    __jait_capture(0, (c.snapshot().rooms[0].latestSenderAvatarUrl));
    await c.sync({ rooms: { join: { '!room:test': { timeline: { events: [message('$eve', '@eve:test')] } } } } });
    __jait_captureType(1, (c.snapshot().rooms[0].latestSenderAvatarUrl));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_159_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.events.push({ ...message('$reply'), content: { body: 'reply', 'm.relates_to': { 'm.in_reply_to': { event_id: '$one' } } } });
    room.events.push({ event_id: '$edit', type: 'm.room.message', sender: room.events[0].sender, content: { 'm.relates_to': { rel_type: 'm.replace', event_id: '$one' }, 'm.new_content': { body: 'updated' } } } as any);
    __jait_capture(0, (c.messages('!room:test')[1].replyTo), ({ id: '$one', sender: room.events[0].sender, body: 'updated' }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_165_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_172_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_179_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_188_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_197_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_209_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room } = setup();
    room.states = [{ type: 'm.bridge', state_key: 'teams', content: { bridgebot: '@teamsbot:test' } }] as any;
    room.receipts = { '$one': { '@teamsbot:test': { ts: 123 } } } as any;
    __jait_capture(0, (c.messages('!room:test')[0]));
    room.receipts = {};
    const status = (id: string, sender: string, state: string, delivered?: string[]) => ({
      event_id: id, type: 'com.beeper.message_send_status', sender,
      content: { 'm.relates_to': { rel_type: 'm.reference', event_id: '$one' }, status: state, ...(delivered ? { delivered_to_users: delivered } : {}) },
    });
    const sync = (event: any) => c.sync({ rooms: { join: { '!room:test': { timeline: { events: [event] } } } } });
    await sync(status('$forged', '@other:test', 'SUCCESS', ['@bob:test']));
    __jait_captureType(1, (c.messages('!room:test')[0].bridgeStatus));
    await sync(status('$sent', '@teamsbot:test', 'SUCCESS'));
    __jait_capture(2, (c.messages('!room:test')[0].bridgeStatus));
    await sync(status('$empty', '@teamsbot:test', 'SUCCESS', []));
    __jait_capture(3, (c.messages('!room:test')[0].bridgeStatus));
    await sync(status('$delivered', '@teamsbot:test', 'SUCCESS', ['@bob:test']));
    __jait_capture(4, (c.messages('!room:test')[0].bridgeStatus));
    await sync(status('$later-sent', '@teamsbot:test', 'SUCCESS'));
    await sync(status('$retrying', '@teamsbot:test', 'FAIL_RETRIABLE'));
    __jait_capture(5, (c.messages('!room:test')[0].bridgeStatus));
    await sync(status('$failed', '@teamsbot:test', 'FAIL_PERMANENT'));
    __jait_capture(6, (c.messages('!room:test')[0].bridgeStatus));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_234_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c, room, message } = setup();
    room.states = [{ type: 'm.bridge', state_key: 'teams', content: { bridgebot: '@teamsbot:test' } }] as any;
    room.events = [message('$one'), message('$two')];
    room.receipts = { '$two': { '@bob:test': { ts: 123, thread_id: '$thread' }, '@teamsbot:test': { ts: 124, thread_id: '$thread' } } } as any;
    __jait_capture(0, (c.messages('!room:test').map((m: any) => [m.readBy, m.bridgeStatus])));
    room.receipts['$two']['@bob:test'].thread_id = 'main';
    __jait_capture(1, (c.messages('!room:test')[0].readBy));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_243_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_252_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_262_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.useFakeTimers();
    try {
      const { c } = setup();
      c.save = vi.fn();
      c.client.setPresenceStatus = vi.fn().mockResolvedValue(undefined);
      await c.setOwnPresence('online', true);
      __jait_capture(0, (c.save.mock.calls));
      await vi.advanceTimersByTimeAsync(45_000);
      __jait_capture(1, (c.client.setPresenceStatus.mock.calls));
      await c.setOwnPresence('unavailable', false);
      await vi.advanceTimersByTimeAsync(45_000);
      __jait_capture(2, (c.client.setPresenceStatus.mock.calls));
    } finally { vi.useRealTimers(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_277_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c } = setup();
    c.save = vi.fn();
    c.client.setPresenceStatus = vi.fn().mockRejectedValue(new Error('unavailable'));
    await __jait_rejected(0, c.setOwnPresence('online', true));
    __jait_capture(1, (c.save.mock.calls));
    __jait_capture(2, (c.ownPresence.keep));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_288_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_294_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_299_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_304_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_308_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_315_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_323_3_each0": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_323_3_each1": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_356_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { c } = setup();
    await c.sync({ rooms: { join: { '!teams:test': { state: { events: [
      { type: 'm.room.name', state_key: '', content: { name: 'f847f7fa-2799-4dde-b3d1-f73019ebc1f0' } },
      { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Alice', membership: 'join' } },
    ] }, timeline: { events: [] } } } } });
    __jait_capture(0, (c.snapshot().rooms.find((r: any) => r.id === '!teams:test').name));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_364_3_each0": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = '';

try {
await (async()=>{

    const { c } = setup();
    const id = '!teams:test';
    const summary = () => c.snapshot().rooms.find((room: any) => room.id === id);
    await c.sync({
      account_data: { events: [{ type: 'm.direct', content: { '@bob:test': [id] } }] },
      rooms: { join: { [id]: { state: { events: [
        { type: 'm.room.name', state_key: '', content: { name: 'Alice' } },
        { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: 'msteams' }, bridgebot: '@bridge:test' } },
        { type: 'm.room.member', state_key: '@bridge:test', content: { displayname: 'Teams bridge', membership: 'join' } },
        { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Alice', membership: 'join' } },
      ] } } } },
    });
    __jait_capture(0, (summary()));

    const updateTitle = (title: string) => c.sync({ rooms: { join: { [id]: { timeline: { events: [
      { type: 'm.room.name', state_key: '', content: { name: title } },
    ] } } } } });
    await updateTitle(name);
    __jait_capture(1, (summary()));

    await updateTitle('New conversation title');
    __jait_capture(2, (summary().name));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_364_3_each1": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const name = '   ';

try {
await (async()=>{

    const { c } = setup();
    const id = '!teams:test';
    const summary = () => c.snapshot().rooms.find((room: any) => room.id === id);
    await c.sync({
      account_data: { events: [{ type: 'm.direct', content: { '@bob:test': [id] } }] },
      rooms: { join: { [id]: { state: { events: [
        { type: 'm.room.name', state_key: '', content: { name: 'Alice' } },
        { type: 'm.bridge', state_key: 'teams', content: { protocol: { id: 'msteams' }, bridgebot: '@bridge:test' } },
        { type: 'm.room.member', state_key: '@bridge:test', content: { displayname: 'Teams bridge', membership: 'join' } },
        { type: 'm.room.member', state_key: '@bob:test', content: { displayname: 'Alice', membership: 'join' } },
      ] } } } },
    });
    __jait_capture(0, (summary()));

    const updateTitle = (title: string) => c.sync({ rooms: { join: { [id]: { timeline: { events: [
      { type: 'm.room.name', state_key: '', content: { name: title } },
    ] } } } } });
    await updateTitle(name);
    __jait_capture(1, (summary()));

    await updateTitle('New conversation title');
    __jait_capture(2, (summary().name));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_388_3_each0": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_388_3_each1": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_388_3_each2": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_388_3_each3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
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
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_403_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, c, room, message } = setup();
    c.assistantAccess = true;
    const original = Buffer.from('fixture image bytes');
    const encrypted = await encryptAttachment(Uint8Array.from(original).buffer);
    c.client.doRequest.mockResolvedValue(Buffer.from(encrypted.data));
    room.events.push(message('$picture', '@bob:test', {
      msgtype: 'm.image', body: 'photo', filename: '../../escape.png',
      file: { ...encrypted.info, url: 'mxc://test/media-id' },
      info: { mimetype: 'image/png', size: original.length },
    }) as any);

    const listed = await service.assistant('test', { action: 'messages', roomId: '!room:test' });
    __jait_capture(0, (listed.ok));
    const text = JSON.stringify(listed);
    __jait_capture(1, (text));
    __jait_capture(2, (text));
    __jait_capture(3, (text));
    __jait_capture(4, (text), (encrypted.info.key.k));
    const attachmentList = await service.assistant('test', { action: 'messages', roomId: '!room:test', attachmentsOnly: true });
    __jait_capture(5, ((attachmentList.data as any).messages.map((item: any) => item.id)));
    const searched = await service.assistant('test', { action: 'search', roomId: '!room:test', query: 'escape.png' });
    __jait_capture(6, (JSON.stringify(searched)));
    __jait_capture(7, (JSON.stringify(searched)), (encrypted.info.key.k));

    const bridge = new MessengerBridge();
    bridge.setGatewayHandler((owner, cmd, signal) => service.assistant(owner, cmd, signal));
    const registry = new SurfaceRegistry();
    registry.register(new FileSystemSurfaceFactory());
    const root = fileURLToPath(new URL(`../../../../.jait/artifacts/messenger-test-${randomUUID()}`, __jait_original_url));
    mkdirSync(root, { recursive: true });
    const context = { userId: 'test', sessionId: 'attachment-session', actionId: 'a', projectRoot: root, requestedBy: 'test' };
    try {
      const tool = createMessengerTools(bridge, registry).find(t => t.name === 'messenger.attachment')!;
      const result = await tool.execute({ roomId: '!room:test', eventId: '$picture' }, context);
      __jait_capture(8, (result.ok));
      const data = result.data as { path: string; size: number };
      __jait_capture(9, (data.path.startsWith(join(root, '.jait/artifacts/messenger') + '/')));
      __jait_capture(10, (readFileSync(data.path)), (original));
      __jait_capture(11, (JSON.stringify(result)), (encrypted.info.key.k));
      __jait_capture(12, (JSON.stringify(result)), (original.toString('base64')));
      const viewed = await createImageViewTool(registry).execute({ path: data.path }, context);
      const content = mcpContentForToolResult(viewed, context, 'image.view');
      __jait_capture(13, (content), ({ type: 'image', data: original.toString('base64'), mimeType: 'image/png' }));
      __jait_capture(14, (JSON.stringify(content[0])), (original.toString('base64')));
      __jait_capture(15, (JSON.stringify(viewed)));
      __jait_capture(16, (c.client.doRequest.mock.calls));
    } finally {
      await registry.stopAll('test');
      rmSync(root, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_456_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const { service, c, room, message } = setup();
    room.events.push(message('$large', '@bob:test', { msgtype: 'm.file', body: 'large', url: 'mxc://test/id', info: { size: 21 * 1024 * 1024 } }) as any);
    __jait_capture(0, ((await service.assistant('test', { action: 'attachment', roomId: '!room:test', eventId: '$large' })).ok));
    c.assistantAccess = true;
    __jait_capture(1, ((await service.assistant('test', { action: 'attachment', roomId: '!missing:test', eventId: '$large' })).ok));
    __jait_capture(2, ((await service.assistant('test', { action: 'attachment', roomId: '!room:test', eventId: '$missing' })).ok));
    __jait_capture(3, ((await service.assistant('test', { action: 'attachment', roomId: '!room:test', eventId: '$large' })).message));
    room.summary.membership = 'leave';
    __jait_capture(4, ((await service.assistant('test', { action: 'attachment', roomId: '!room:test', eventId: '$large' })).ok));
    __jait_capture(5, (c.client.doRequest.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_services_messenger_service_test_ts_469_3": {

const { encryptAttachment } = await import((typeof Bun!=="undefined"?Bun.resolveSync("matrix-encrypt-attachment", __jait_original_dir):__jait_require.resolve("matrix-encrypt-attachment")));
function setup() {
  const service = new MessengerService('test', fileURLToPath(new URL('../../../../.jait/artifacts/messenger-fixes/state', __jait_original_url)));
  const c = (service as any).connection('test');
  c.status = 'ready';
  c.session = { userId: '@alice:test' };
  c.client = { doRequest: vi.fn(), sendMessage: vi.fn().mockResolvedValue('$edit'), sendEvent: vi.fn().mockResolvedValue('$reaction'), redactEvent: vi.fn().mockResolvedValue('$redaction'), leaveRoom: vi.fn().mockResolvedValue(undefined) };
  const message = (id: string, sender = '@alice:test', content = { body: 'original', msgtype: 'm.text' }) => ({ event_id: id, sender, type: 'm.room.message', origin_server_ts: 1, content });
  const room = { summary: { id: '!room:test', membership: 'join' }, events: [message('$one')], states: [], receipts: {}, previous: 'page1' };
  c.rooms.set('!room:test', room);
  return { service, c, room, message };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const root = fileURLToPath(new URL(`../../../../.jait/artifacts/messenger-link-test-${randomUUID()}`, __jait_original_url));
    const outside = fileURLToPath(new URL(`../../../../.jait/artifacts/messenger-link-outside-${randomUUID()}`, __jait_original_url));
    mkdirSync(root, { recursive: true }); mkdirSync(outside, { recursive: true });
    symlinkSync(outside, join(root, '.jait'), 'dir');
    const registry = new SurfaceRegistry(); registry.register(new FileSystemSurfaceFactory());
    const bridge = new MessengerBridge();
    bridge.setGatewayHandler(async () => ({ ok: true, message: 'loaded', data: { name: 'x.png', mime: 'image/png', image: true, size: 1, base64: 'eA==' } }));
    try {
      const tool = createMessengerTools(bridge, registry).find(t => t.name === 'messenger.attachment')!;
      const result = await tool.execute({ roomId: '!room:test', eventId: '$picture' }, { userId: 'test', sessionId: 'symlink-session', actionId: 'a', projectRoot: root, requestedBy: 'test' });
      __jait_capture(0, (result.ok));
    } finally {
      await registry.stopAll('test');
      rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true });
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
