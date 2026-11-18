// Translated fixture from packages/gateway/src/channels/telegram/connector.test.ts; expected literals are in tail_static.rs.
import {
  TELEGRAM_MAX_COMMANDS,
  TelegramConnector,
  botFatherSetupLink,
  describePollFailure,
  extractBotToken,
  generateUsernameSlug,
  isFatalPollError,
  isPaired,
  pollBackoffMs,
  parseStartPayload,
  sanitizeReturnUrl,
  suggestBotUsername,
  telegramMessageToInbound,
  toTelegramCommands,
} from "../../../../packages/gateway/src/channels/telegram/connector.js";
import type { ChannelPairing, ChannelStatus, ChannelStatusDetail, InboundMessage } from "../../../../packages/gateway/src/channels/types.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/channels/telegram/connector.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_21_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const inbound = telegramMessageToInbound({
      message_id: 10,
      date: 1_700_000_000,
      chat: { id: 123 },
      from: { id: 456, username: "alice" },
      text: "hello",
    });

    __jait_capture(0, (inbound));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_41_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const statuses: Array<{ status: ChannelStatus; error?: string }> = [];
    const connector = new TelegramConnector({ token: "" });

    await connector.start({
      onInbound: () => {},
      onStatus: (status, detail) => { statuses.push({ status, error: detail?.error }); },
    });

    __jait_capture(0, (statuses));
    __jait_capture(1, (statuses[0]!.status));
    __jait_capture(2, (statuses[0]!.error));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_56_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (parseStartPayload("/start abc123")));
      __jait_capture(1, (parseStartPayload("/start@jait_bot abc123")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_61_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (parseStartPayload("/start")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_65_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_captureType(0, (parseStartPayload("start the build")));
      __jait_captureType(1, (parseStartPayload("/startup")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_72_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isPaired({ allowedSenders: ["123"] })));
      __jait_capture(1, (isPaired({ respondToAll: true })));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_77_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isPaired({})));
      __jait_capture(1, (isPaired(undefined)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_84_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      const reply = [
        "Done! Congratulations on your new bot.",
        "Use this token to access the HTTP API:",
        "8123456789:AAF-mK3sample_TOKEN-value_1234567890x",
        "Keep your token secure.",
      ].join("\n");

      __jait_capture(0, (extractBotToken(reply)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_95_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (extractBotToken("  8123456789:AAF-mK3sample_TOKEN-value_1234567890x  ")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_100_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_captureType(0, (extractBotToken("no token here")));
      __jait_captureType(1, (extractBotToken("123:short")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_107_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (sanitizeReturnUrl("https://jait.example/settings")));
      __jait_capture(1, (sanitizeReturnUrl("http://localhost:8010/")));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_112_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_captureType(0, (sanitizeReturnUrl("javascript:alert(1)")));
      __jait_captureType(1, (sanitizeReturnUrl("tg://resolve?domain=x")));
      __jait_captureType(2, (sanitizeReturnUrl("not a url")));
      __jait_captureType(3, (sanitizeReturnUrl("")));
      __jait_captureType(4, (sanitizeReturnUrl(undefined)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_122_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (botFatherSetupLink()));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_126_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      const username = suggestBotUsername("abc123");
      __jait_capture(0, (username));
      __jait_capture(1, (username.endsWith("bot")));
      __jait_capture(2, (username.length));
      __jait_capture(3, (username.length));
      __jait_capture(4, (username));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_135_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      const connector = new TelegramConnector({
        encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
      });

      const guide = await connector.setupGuide();

      __jait_capture(0, (guide.link));
      __jait_capture(1, (guide.qr));
      __jait_capture(2, (guide.suggestedName));
      __jait_capture(3, (guide.suggestedUsername));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_148_5": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });
/*__jait_scope_open__*/{

try {
await (async()=>{

      const connector = new TelegramConnector({
        encodeQr: async () => { throw new Error("no encoder"); },
        log: () => {},
      });

      const guide = await connector.setupGuide();

      __jait_captureType(0, (guide.qr));
      __jait_capture(1, (guide.link));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_199_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl } = fakeApi([]);
    const details: ChannelStatusDetail[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async (text) => `data:image/png;base64,${Buffer.from(text).toString("base64")}`,
    });

    await connector.start({
      onInbound: () => {},
      onStatus: (_status, detail) => { if (detail) details.push(detail); },
    }, {});

    __jait_capture(0, (connector.status()));
    __jait_capture(1, (connector.currentLink()));
    __jait_capture(2, (connector.currentQr()));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_220_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const paired: ChannelPairing[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({
      onInbound: () => {},
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await vi.waitFor(() => __jait_capture(0, (paired)));
    __jait_capture(1, (paired[0]));
    __jait_capture(2, (connector.status()));
    await vi.waitFor(() => __jait_capture(3, (sent)));
    __jait_capture(4, (String(sent[0]!.text)));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_244_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      {},
      { returnUrl: "https://jait.example/settings" },
    );

    await vi.waitFor(() => __jait_capture(0, (sent)));
    __jait_capture(1, (String(sent[0]!.text)));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_264_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl, sent } = fakeApi([startUpdate("CODE123")]);
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      {},
      { returnUrl: "javascript:alert(1)" },
    );

    await vi.waitFor(() => __jait_capture(0, (sent)));
    __jait_capture(1, (String(sent[0]!.text)));
    __jait_capture(2, (String(sent[0]!.text)));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_285_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl, sent } = fakeApi([startUpdate("WRONG")]);
    const paired: ChannelPairing[] = [];
    const inbound: unknown[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({
      onInbound: (msg) => { inbound.push(msg); },
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await vi.waitFor(() => __jait_capture(0, (sent)));
    __jait_capture(1, (paired));
    __jait_capture(2, (inbound));
    __jait_capture(3, (connector.status()));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_309_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl } = fakeApi([]);
    const connector = new TelegramConnector({ token: "t", fetchImpl });

    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    __jait_capture(0, (connector.status()));
    __jait_captureType(1, (connector.currentQr()));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_320_3": {


/*__jait_scope_open__*/{
function fakeApi(updates: unknown[]) {
    const sent: Array<Record<string, unknown>> = [];
    let polled = false;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = (init as { body?: string } | undefined)?.body;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (polled) return await new Promise<Response>(() => {}); // idle forever
        polled = true;
        return json({ ok: true, result: updates });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return { fetchImpl: fetchImpl as unknown as typeof fetch, sent };
  }
const startUpdate = (payload: string) => ({
    update_id: 1,
    message: {
      message_id: 1,
      date: 1_700_000_000,
      chat: { id: 4242, type: "private" },
      from: { id: 4242, username: "lukas" },
      text: `/start ${payload}`,
    },
  });

try {
await (async()=>{

    const { fetchImpl } = fakeApi([]);
    const connector = new TelegramConnector({ fetchImpl });

    await connector.start(
      { onInbound: () => {}, onStatus: () => {} },
      { token: "from-config", allowedSenders: ["1"] },
    );

    __jait_capture(0, (connector.status()));
    __jait_capture(1, (String((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]![0])));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_336_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const commands = toTelegramCommands([
      { name: "Model", description: "Switch model" },
      { name: "my-command", description: "Hyphens are not allowed" },
      { name: "model", description: "duplicate — dropped" },
      { name: "", description: "no name" },
      { name: "empty", description: "   " },
      { name: "x".repeat(40), description: "y".repeat(300) },
    ]);

    __jait_capture(0, (commands), ([
      { command: "model", description: "Switch model" },
      { command: "my_command", description: "Hyphens are not allowed" },
      { command: "x".repeat(32), description: "y".repeat(256) },
    ]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_353_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const many = Array.from({ length: 150 }, (_, i) => ({ name: `cmd${i}`, description: `Command ${i}` }));
    __jait_capture(0, (toTelegramCommands(many)), (TELEGRAM_MAX_COMMANDS));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_358_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const calls: Array<Record<string, unknown>> = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const body = (init as { body?: string } | undefined)?.body;
      if (String(url).endsWith("/setMyCommands")) calls.push(JSON.parse(body ?? "{}") as Record<string, unknown>);
      return { json: async () => ({ ok: true }) } as unknown as Response;
    });
    const connector = new TelegramConnector({ token: "t", fetchImpl: fetchImpl as unknown as typeof fetch });

    await connector.setCommandMenu([{ name: "model", description: "Switch model" }]);

    __jait_capture(0, (calls.map((c) => (c.scope as { type: string }).type)));
    __jait_capture(1, (calls[0]!.commands));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_374_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchImpl = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/setMyCommands")) throw new Error("network down");
      return { json: async () => ({ ok: true }) } as unknown as Response;
    });
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      log: () => {},
    });

    await __jait_captureResolved(0, (connector.setCommandMenu([{ name: "model", description: "Switch model" }])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_388_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchImpl = vi.fn();
    const connector = new TelegramConnector({ token: "", fetchImpl: fetchImpl as unknown as typeof fetch });

    await connector.setCommandMenu([{ name: "model", description: "Switch model" }]);

    __jait_capture(0, (fetchImpl.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_434_3": {


/*__jait_scope_open__*/{
function dialogApi() {
    const sent: Array<Record<string, unknown>> = [];
    const answered: Array<Record<string, unknown>> = [];
    const edited: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = JSON.parse((init as { body?: string } | undefined)?.body ?? "{}") as Record<string, unknown>;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) { sent.push(body); return json({ ok: true, result: { message_id: 7 } }); }
      if (path.endsWith("/answerCallbackQuery")) { answered.push(body); return json({ ok: true }); }
      if (path.endsWith("/editMessageReplyMarkup")) { edited.push(body); return json({ ok: true }); }
      if (path.endsWith("/setMyCommands")) return json({ ok: true });
      if (path.endsWith("/getUpdates")) {
        polls += 1;
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        // Keep long-polling like the real API instead of parking forever, so an
        // update queued after the first poll is still picked up.
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sent, answered, edited,
      pollCount: () => polls,
      tap: (data: string) => { pending = [{ update_id: 99, callback_query: { id: "q1", data, from: { id: 4242, username: "lukas" }, message: { message_id: 7, chat: { id: 4242, type: "private" } } } }]; },
    };
  }

try {
await (async()=>{

    const api = dialogApi();
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({
      conversationId: "4242",
      text: "Pick one:",
      choices: [{ label: "GPT-4o", value: "/model gpt-4o" }, { label: "Llama 3", value: "/model llama3" }],
    });

    const markup = api.sent.at(-1)!["reply_markup"] as { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> };
    __jait_capture(0, (markup.inline_keyboard.map((row) => row[0]!.text)));
    // Values ride in the token map, not in callback_data (64-byte cap).
    for (const row of markup.inline_keyboard) {
      __jait_capture(1, (row[0]!.callback_data.length));
      __jait_capture(2, (row[0]!.callback_data));
    }
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_455_3": {


/*__jait_scope_open__*/{
function dialogApi() {
    const sent: Array<Record<string, unknown>> = [];
    const answered: Array<Record<string, unknown>> = [];
    const edited: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = JSON.parse((init as { body?: string } | undefined)?.body ?? "{}") as Record<string, unknown>;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) { sent.push(body); return json({ ok: true, result: { message_id: 7 } }); }
      if (path.endsWith("/answerCallbackQuery")) { answered.push(body); return json({ ok: true }); }
      if (path.endsWith("/editMessageReplyMarkup")) { edited.push(body); return json({ ok: true }); }
      if (path.endsWith("/setMyCommands")) return json({ ok: true });
      if (path.endsWith("/getUpdates")) {
        polls += 1;
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        // Keep long-polling like the real API instead of parking forever, so an
        // update queued after the first poll is still picked up.
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sent, answered, edited,
      pollCount: () => polls,
      tap: (data: string) => { pending = [{ update_id: 99, callback_query: { id: "q1", data, from: { id: 4242, username: "lukas" }, message: { message_id: 7, chat: { id: 4242, type: "private" } } } }]; },
    };
  }

try {
await (async()=>{

    const api = dialogApi();
    const inbound: InboundMessage[] = [];
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: (m) => { inbound.push(m); }, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({
      conversationId: "4242",
      text: "Pick one:",
      choices: [{ label: "Llama 3", value: "/model llama3" }],
    });
    const markup = api.sent.at(-1)!["reply_markup"] as { inline_keyboard: Array<Array<{ callback_data: string }>> };
    api.tap(markup.inline_keyboard[0]![0]!.callback_data);

    await vi.waitFor(() => __jait_capture(0, (inbound)));
    __jait_capture(1, (inbound[0]));
    __jait_capture(2, (api.answered));
    // Keyboard removed so the dialog cannot be answered twice.
    __jait_capture(3, (api.edited));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_477_3": {


/*__jait_scope_open__*/{
function dialogApi() {
    const sent: Array<Record<string, unknown>> = [];
    const answered: Array<Record<string, unknown>> = [];
    const edited: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = JSON.parse((init as { body?: string } | undefined)?.body ?? "{}") as Record<string, unknown>;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) { sent.push(body); return json({ ok: true, result: { message_id: 7 } }); }
      if (path.endsWith("/answerCallbackQuery")) { answered.push(body); return json({ ok: true }); }
      if (path.endsWith("/editMessageReplyMarkup")) { edited.push(body); return json({ ok: true }); }
      if (path.endsWith("/setMyCommands")) return json({ ok: true });
      if (path.endsWith("/getUpdates")) {
        polls += 1;
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        // Keep long-polling like the real API instead of parking forever, so an
        // update queued after the first poll is still picked up.
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sent, answered, edited,
      pollCount: () => polls,
      tap: (data: string) => { pending = [{ update_id: 99, callback_query: { id: "q1", data, from: { id: 4242, username: "lukas" }, message: { message_id: 7, chat: { id: 4242, type: "private" } } } }]; },
    };
  }

try {
await (async()=>{

    const api = dialogApi();
    const inbound: InboundMessage[] = [];
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: (m) => { inbound.push(m); }, onStatus: () => {} }, { allowedSenders: ["4242"] });

    api.tap("c999");

    await vi.waitFor(() => __jait_capture(0, (api.answered)));
    __jait_capture(1, (String(api.answered[0]!["text"])));
    __jait_capture(2, (inbound));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_491_3": {


/*__jait_scope_open__*/{
function dialogApi() {
    const sent: Array<Record<string, unknown>> = [];
    const answered: Array<Record<string, unknown>> = [];
    const edited: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    let polls = 0;
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const body = JSON.parse((init as { body?: string } | undefined)?.body ?? "{}") as Record<string, unknown>;
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;

      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) { sent.push(body); return json({ ok: true, result: { message_id: 7 } }); }
      if (path.endsWith("/answerCallbackQuery")) { answered.push(body); return json({ ok: true }); }
      if (path.endsWith("/editMessageReplyMarkup")) { edited.push(body); return json({ ok: true }); }
      if (path.endsWith("/setMyCommands")) return json({ ok: true });
      if (path.endsWith("/getUpdates")) {
        polls += 1;
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        // Keep long-polling like the real API instead of parking forever, so an
        // update queued after the first poll is still picked up.
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      sent, answered, edited,
      pollCount: () => polls,
      tap: (data: string) => { pending = [{ update_id: 99, callback_query: { id: "q1", data, from: { id: 4242, username: "lukas" }, message: { message_id: 7, chat: { id: 4242, type: "private" } } } }]; },
    };
  }

try {
await (async()=>{

    const api = dialogApi();
    const connector = new TelegramConnector({ token: "t", fetchImpl: api.fetchImpl });
    await connector.start({ onInbound: () => {}, onStatus: () => {} }, { allowedSenders: ["4242"] });

    await connector.send({ conversationId: "4242", text: "hello" });

    __jait_captureType(0, (api.sent.at(-1)!["reply_markup"]));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_519_3": {


/*__jait_scope_open__*/{
function api() {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: {} });
      if (path.endsWith("/getUpdates")) {
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });
    return fetchImpl as unknown as typeof fetch;
  }

try {
await (async()=>{

    const details: ChannelStatusDetail[] = [];
    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: api(),
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
      pairingTtlMs: 60_000,
    });

    await connector.start({
      onInbound: () => {},
      onStatus: (_status, detail) => { if (detail) details.push(detail); },
    }, {});

    const expiresAt = details.at(-1)!.expiresAt;
    __jait_captureType(0, (expiresAt));
    const remaining = new Date(expiresAt!).getTime() - Date.now();
    __jait_capture(1, (remaining));
    __jait_capture(2, (remaining));
    __jait_capture(3, (connector.currentExpiry()), (expiresAt));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_543_3": {


/*__jait_scope_open__*/{
function api() {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: {} });
      if (path.endsWith("/getUpdates")) {
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });
    return fetchImpl as unknown as typeof fetch;
  }

try {
await (async()=>{

    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: api(),
      encodeQr: async () => "data:image/png;base64,x",
    });

    await connector.start({ onInbound: () => {}, onStatus: () => {} }, {});
    __jait_captureType(0, (connector.currentExpiry()));

    await connector.stop();
    __jait_captureType(1, (connector.currentExpiry()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_557_3": {


/*__jait_scope_open__*/{
function api() {
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: {} });
      if (path.endsWith("/getUpdates")) {
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });
    return fetchImpl as unknown as typeof fetch;
  }

try {
await (async()=>{

    const paired: ChannelPairing[] = [];
    const sent: Array<Record<string, unknown>> = [];
    let pending: unknown[] = [];
    const fetchImpl = vi.fn(async (url: unknown, init?: unknown) => {
      const path = String(url);
      const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
      if (path.endsWith("/getMe")) return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      if (path.endsWith("/sendMessage")) {
        sent.push(JSON.parse((init as { body?: string }).body ?? "{}") as Record<string, unknown>);
        return json({ ok: true, result: {} });
      }
      if (path.endsWith("/getUpdates")) {
        if (pending.length) { const batch = pending; pending = []; return json({ ok: true, result: batch }); }
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: true, result: {} });
    });

    const connector = new TelegramConnector({
      token: "t",
      fetchImpl: fetchImpl as unknown as typeof fetch,
      makePairingCode: () => "CODE123",
      encodeQr: async () => "data:image/png;base64,x",
      pairingTtlMs: 20,
    });
    await connector.start({
      onInbound: () => {},
      onStatus: () => {},
      onPaired: (p) => { paired.push(p); },
    }, {});

    await new Promise((r) => setTimeout(r, 50)); // let the code lapse
    pending = [{
      update_id: 1,
      message: { message_id: 1, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text: "/start CODE123" },
    }];

    await vi.waitFor(() => __jait_capture(0, (sent.length)));
    __jait_capture(1, (paired));
    __jait_capture(2, (String(sent.at(-1)!["text"])));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_658_3": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

try {
await (async()=>{

    const api = scriptedApi([{ throws: "fetch failed" }, { updates: [textUpdate("hello")] }]);
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: () => {} },
      { allowedSenders: ["4242"] },
    );

    // The message arrives on the poll *after* the failure — the loop used to
    // die on the first dropped request and never come back.
    await vi.waitFor(() => __jait_capture(0, (inbound)));
    __jait_capture(1, (inbound[0]!.text));
    __jait_capture(2, (connector.status()));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_676_3": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

try {
await (async()=>{

    const api = scriptedApi([
      { throws: "fetch failed" },
      { throws: "fetch failed" },
      { throws: "fetch failed" },
      { updates: [textUpdate("back")] },
    ]);
    const statuses: ChannelStatus[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: () => {}, onStatus: (status) => { statuses.push(status); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => __jait_capture(0, (statuses)));
    await vi.waitFor(() => __jait_capture(1, (connector.status())));
    // One badge per outage, not one per attempt.
    __jait_capture(2, (statuses.filter((s) => s === "error")));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_698_3": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

try {
await (async()=>{

    const api = scriptedApi([
      { fails: { error_code: 409, description: "Conflict: terminated by other getUpdates request" } },
      { updates: [textUpdate("mine")] },
    ]);
    const details: ChannelStatusDetail[] = [];
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: (_s, detail) => { if (detail) details.push(detail); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => __jait_capture(0, (details.some((d) => /only one/i.test(d.error ?? "")))));
    await vi.waitFor(() => __jait_capture(1, (inbound)));
    await connector.stop();
  
})();
__jait_record({slot:2,completed:true});
} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_717_3": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

try {
await (async()=>{

    const api = scriptedApi([{ fails: { error_code: 401, description: "Unauthorized" } }]);
    const details: ChannelStatusDetail[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: () => {}, onStatus: (_s, detail) => { if (detail) details.push(detail); } },
      { allowedSenders: ["4242"] },
    );

    await vi.waitFor(() => __jait_capture(0, (connector.status())));
    __jait_capture(1, (details.at(-1)!.error));

    // A rejected token is not going to fix itself — no retry storm.
    const polls = api.pollCount();
    await new Promise((r) => setTimeout(r, 30));
    __jait_capture(2, (api.pollCount()), (polls));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_737_3": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }

try {
await (async()=>{

    const api = scriptedApi([{ updates: [textUpdate("later")] }], { getMeFailures: 1 });
    const inbound: InboundMessage[] = [];
    const connector = pairedConnector(api.fetchImpl);

    await connector.start(
      { onInbound: (m) => { inbound.push(m); }, onStatus: () => {} },
      { allowedSenders: ["4242"] },
    );

    // Visible as broken straight away, but not abandoned.
    __jait_capture(0, (connector.status()));
    await vi.waitFor(() => __jait_capture(1, (connector.status())));
    await vi.waitFor(() => __jait_capture(2, (inbound)));
    await connector.stop();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_755_5": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (isFatalPollError(401)));
      __jait_capture(1, (isFatalPollError(404)));
      __jait_capture(2, (isFatalPollError(409)));
      __jait_capture(3, (isFatalPollError(502)));
      __jait_capture(4, (isFatalPollError(undefined)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_763_5": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (pollBackoffMs(1, 1_000, 30_000)));
      __jait_capture(1, (pollBackoffMs(2, 1_000, 30_000)));
      __jait_capture(2, (pollBackoffMs(3, 1_000, 30_000)));
      __jait_capture(3, (pollBackoffMs(99, 1_000, 30_000)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_770_5": {


/*__jait_scope_open__*/{
type PollStep = {
    /** Deliver these updates. */
    updates?: unknown[];
    /** Reject the request, the way a dropped socket does. */
    throws?: string;
    /** Answer `ok: false`, the way the Bot API reports a refusal. */
    fails?: { error_code?: number; description: string };
  };
function scriptedApi(steps: PollStep[], opts?: { getMeFailures?: number }) {
    const json = (value: unknown) => ({ json: async () => value }) as unknown as Response;
    let polled = 0;
    let getMeCalls = 0;
    const fetchImpl = vi.fn(async (url: unknown) => {
      const path = String(url);
      if (path.endsWith("/getMe")) {
        getMeCalls += 1;
        if (getMeCalls <= (opts?.getMeFailures ?? 0)) throw new TypeError("fetch failed");
        return json({ ok: true, result: { id: 1, username: "jait_bot" } });
      }
      if (path.endsWith("/sendMessage")) return json({ ok: true, result: { message_id: 1 } });
      if (path.endsWith("/getUpdates")) {
        const step = steps[polled];
        polled += 1;
        if (step?.throws) throw new TypeError(step.throws);
        if (step?.fails) return json({ ok: false, ...step.fails });
        if (step?.updates) return json({ ok: true, result: step.updates });
        await new Promise((r) => setTimeout(r, 10));
        return json({ ok: true, result: [] });
      }
      return json({ ok: false, description: `unexpected ${path}` });
    });
    return {
      fetchImpl: fetchImpl as unknown as typeof fetch,
      pollCount: () => polled,
      getMeCount: () => getMeCalls,
    };
  }
const textUpdate = (text: string, id = 1) => ({
    update_id: id,
    message: { message_id: id, date: 1, chat: { id: 4242, type: "private" }, from: { id: 4242 }, text },
  });
function pairedConnector(fetchImpl: typeof fetch) {
    return new TelegramConnector({ token: "t", fetchImpl, pollRetryMinMs: 1, pollRetryMaxMs: 2 });
  }
/*__jait_scope_open__*/{

try {
await (async()=>{

      __jait_capture(0, (describePollFailure("Conflict: terminated by other getUpdates request", 409)));
      __jait_capture(1, (describePollFailure("Unauthorized", 401)));
      __jait_capture(2, (describePollFailure("fetch failed", undefined)));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_780_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const username = suggestBotUsername();
    __jait_capture(0, (username.length));
    __jait_capture(1, (username));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_telegram_connector_test_ts_786_3": {


/*__jait_scope_open__*/{

try {
await (async()=>{

    const slugs = new Set(Array.from({ length: 50 }, () => generateUsernameSlug()));
    __jait_capture(0, (slugs.size));
  
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
