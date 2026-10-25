// Translated fixture from packages/gateway/src/channels/manager.test.ts; expected literals are in tail_static.rs.
import { openRawSqlite } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import type { SqliteDatabase } from "../../../../packages/gateway/src/db/sqlite-shim.js";
import {
  ChannelManager,
  buildCliPrompt,
  chooseFallbackModel,
  looksLikeCliAuthFailure,
  formatNotification,
  groupModelsByProvider,
  ProgressReporter,
  formatProgress,
  irreversibleReasonFor,
  normalizeSenderId,
  parseCommand,
  shouldRespond,
  type ReplyContext,
  type ReplyGenerator,
} from "../../../../packages/gateway/src/channels/manager.js";
import type {
  ChannelConfig,
  ChannelConnector,
  ChannelConnectorEvents,
  ChannelStatus,
  InboundMessage,
  OutboundMessage,
} from "../../../../packages/gateway/src/channels/types.js";
import type { AgentMessage, LLMConfig } from "../../../../packages/gateway/src/tools/agent-loop.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/channels/manager.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_channels_manager_test_ts_110_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (shouldRespond(
      { fromMe: true, isSelfChat: false } as InboundMessage,
      {},
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_117_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (shouldRespond({ fromMe: false, isSelfChat: true, senderId: "1" } as InboundMessage, {})));
    __jait_capture(1, (shouldRespond({ fromMe: false, isSelfChat: false, senderId: "1" } as InboundMessage, {})));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_122_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cfg = { allowedSenders: ["+49 170 1234567"] };
    __jait_capture(0, (shouldRespond({ fromMe: false, isSelfChat: false, senderId: "491701234567@s.whatsapp.net" } as InboundMessage, cfg)));
    __jait_capture(1, (shouldRespond({ fromMe: false, isSelfChat: false, senderId: "999@s.whatsapp.net" } as InboundMessage, cfg)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_128_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Regression: LID-addressed self-chat carries an empty/aliased senderId, so
    // it never matches the allowlist — but the self-chat must still be answered.
    const cfg = { allowedSenders: ["+436645336765"], respondToAll: false };
    __jait_capture(0, (shouldRespond({ fromMe: true, isSelfChat: true, senderId: "" } as InboundMessage, cfg)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_135_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const cfg = { respondToAll: true };
    __jait_capture(0, (shouldRespond({ fromMe: false, isSelfChat: false, senderId: "x" } as InboundMessage, cfg)));
    __jait_capture(1, (shouldRespond({ fromMe: true, isSelfChat: false, senderId: "x" } as InboundMessage, cfg)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_143_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (normalizeSenderId("491701234567:5@s.whatsapp.net")));
    __jait_capture(1, (normalizeSenderId("+49 170 1234567")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_153_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_5553 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_5553();
try {
await (async()=>{

    const { mgr } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["123"], enabled: true });
    __jait_capture(0, (mgr.getConfig("fake")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_159_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_5553 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_5553();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");
    connector.emit({ text: "hello there", isSelfChat: true });
    // allow the async pipeline to settle
    await new Promise((r) => setTimeout(r, 10));
    __jait_capture(0, (connector.sent));
    __jait_capture(1, (connector.sent[0]?.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_169_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_5553 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_5553();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");
    connector.emit({ text: "spam", isSelfChat: false, senderId: "999@s.whatsapp.net" });
    await new Promise((r) => setTimeout(r, 10));
    __jait_capture(0, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_177_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_5553 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_5553();
try {
await (async()=>{

    const { mgr } = makeManager(sqlite);
    await mgr.start("fake");
    const list = mgr.list();
    __jait_capture(0, (list[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_184_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_5553 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_5553();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { token: "bot-token", allowedSenders: ["123"] });
    await mgr.start("fake");
    __jait_capture(0, (connector.startConfig));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_196_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_7330 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_7330();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    connector.events?.onPaired?.({ senderId: "4242", senderName: "@lukas", conversationId: "4242" });
    __jait_capture(0, (mgr.getConfig("fake").allowedSenders));

    connector.emit({ text: "hi", senderId: "4242", conversationId: "4242" });
    await new Promise((r) => setTimeout(r, 10));
    __jait_capture(1, (connector.sent));
    __jait_capture(2, (connector.sent[0]?.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_209_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_7330 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_7330();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["111"] });
    await mgr.start("fake");

    connector.events?.onPaired?.({ senderId: "4242", conversationId: "4242" });
    connector.events?.onPaired?.({ senderId: "4242", conversationId: "4242" });

    __jait_capture(0, (mgr.getConfig("fake").allowedSenders));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_220_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_7330 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_7330();
try {
await (async()=>{

    const { mgr } = makeManager(sqlite);
    await mgr.start("fake");
    await __jait_rejected(0, mgr.pair("fake"));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_261_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeConsentManager(timeoutMs = 1000) {
    let mgr: ChannelManager;
    const consent = new ConsentManager({
      defaultTimeoutMs: timeoutMs,
      onRequest: (r) => mgr.handleConsentRequest(r),
      onDecision: (d) => mgr.handleConsentDecision(d),
    });
    const generator: ReplyGenerator = {
      async generate(_history, ctx) {
        const decision = await consent.requestConsent({
          actionId: "a1",
          toolName: "execute",
          summary: "Run execute",
          preview: { command: "rm -rf build" },
          risk: "high",
          policy: { consentLevel: "always", description: "x", knownTool: true, source: "profile" },
          sessionId: ctx.sessionId,
          timeoutMs,
        });
        return decision.approved ? "done: ran it" : "skipped: not run";
      },
    };
    mgr = new ChannelManager({ sqlite, consentManager: consent, resolveLLM: () => fakeLLM, replyGenerator: generator });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consent };
  }
const __jait_hook_8747 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_8747();
try {
await (async()=>{

    const { mgr, connector } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // First outbound is the approval prompt; the turn is now blocked awaiting it.
    __jait_capture(0, (connector.sent));
    __jait_capture(1, (connector.sent[0]?.text));
    __jait_capture(2, (connector.sent[0]?.text.toLowerCase()));

    connector.emit({ text: "yes", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // The "yes" resolved consent; the turn finished and sent its result.
    __jait_capture(3, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_277_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeConsentManager(timeoutMs = 1000) {
    let mgr: ChannelManager;
    const consent = new ConsentManager({
      defaultTimeoutMs: timeoutMs,
      onRequest: (r) => mgr.handleConsentRequest(r),
      onDecision: (d) => mgr.handleConsentDecision(d),
    });
    const generator: ReplyGenerator = {
      async generate(_history, ctx) {
        const decision = await consent.requestConsent({
          actionId: "a1",
          toolName: "execute",
          summary: "Run execute",
          preview: { command: "rm -rf build" },
          risk: "high",
          policy: { consentLevel: "always", description: "x", knownTool: true, source: "profile" },
          sessionId: ctx.sessionId,
          timeoutMs,
        });
        return decision.approved ? "done: ran it" : "skipped: not run";
      },
    };
    mgr = new ChannelManager({ sqlite, consentManager: consent, resolveLLM: () => fakeLLM, replyGenerator: generator });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consent };
  }
const __jait_hook_8747 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_8747();
try {
await (async()=>{

    const { connector, mgr } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    connector.emit({ text: "no", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    __jait_capture(0, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_287_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeConsentManager(timeoutMs = 1000) {
    let mgr: ChannelManager;
    const consent = new ConsentManager({
      defaultTimeoutMs: timeoutMs,
      onRequest: (r) => mgr.handleConsentRequest(r),
      onDecision: (d) => mgr.handleConsentDecision(d),
    });
    const generator: ReplyGenerator = {
      async generate(_history, ctx) {
        const decision = await consent.requestConsent({
          actionId: "a1",
          toolName: "execute",
          summary: "Run execute",
          preview: { command: "rm -rf build" },
          risk: "high",
          policy: { consentLevel: "always", description: "x", knownTool: true, source: "profile" },
          sessionId: ctx.sessionId,
          timeoutMs,
        });
        return decision.approved ? "done: ran it" : "skipped: not run";
      },
    };
    mgr = new ChannelManager({ sqlite, consentManager: consent, resolveLLM: () => fakeLLM, replyGenerator: generator });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consent };
  }
const __jait_hook_8747 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_8747();
try {
await (async()=>{

    const { connector, mgr } = makeConsentManager();
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    connector.emit({ text: "maybe later, what do you think?", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    // Still only the original prompt + the re-prompt; no result yet.
    __jait_capture(0, (connector.sent.some((m) => m.text.includes("yes") && m.text.includes("no"))));
    __jait_capture(1, (connector.sent.map((m) => m.text)));
    __jait_capture(2, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_300_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeConsentManager(timeoutMs = 1000) {
    let mgr: ChannelManager;
    const consent = new ConsentManager({
      defaultTimeoutMs: timeoutMs,
      onRequest: (r) => mgr.handleConsentRequest(r),
      onDecision: (d) => mgr.handleConsentDecision(d),
    });
    const generator: ReplyGenerator = {
      async generate(_history, ctx) {
        const decision = await consent.requestConsent({
          actionId: "a1",
          toolName: "execute",
          summary: "Run execute",
          preview: { command: "rm -rf build" },
          risk: "high",
          policy: { consentLevel: "always", description: "x", knownTool: true, source: "profile" },
          sessionId: ctx.sessionId,
          timeoutMs,
        });
        return decision.approved ? "done: ran it" : "skipped: not run";
      },
    };
    mgr = new ChannelManager({ sqlite, consentManager: consent, resolveLLM: () => fakeLLM, replyGenerator: generator });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consent };
  }
const __jait_hook_8747 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_8747();
try {
await (async()=>{

    const { connector, mgr } = makeConsentManager(60);
    await mgr.start("fake");
    connector.emit({ text: "delete the build dir", isSelfChat: true });
    // Wait past the 60ms approval window without replying.
    await new Promise((r) => setTimeout(r, 150));
    __jait_capture(0, (connector.sent.map((m) => m.text)));
    __jait_capture(1, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_312_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommand("/help")));
    __jait_capture(1, (parseCommand("  /status  ")));
    __jait_capture(2, (parseCommand("/model 3")));
    __jait_capture(3, (parseCommand("/notifications on")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_319_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (parseCommand("/model@jait_bot gpt-4o")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_323_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (parseCommand("what model are you?")));
    __jait_captureType(1, (parseCommand("/deploy production")));
    __jait_captureType(2, (parseCommand("/start CODE")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_331_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (formatNotification({ title: "Build failed", body: "3 tests red", level: "error" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_336_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (formatNotification({ title: "T", body: "B", link: "https://jait.example/plans/1" })));
    __jait_capture(1, (formatNotification({ title: "T", body: "B", link: "/plans/1" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_347_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_14008 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_14008();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, allowedSenders: ["111", "222"] });
    await mgr.start("fake");

    const delivered = await mgr.notify({ title: "Routine done", body: "Nightly sync finished" });

    __jait_capture(0, (delivered));
    __jait_capture(1, (connector.sent.map((m) => m.conversationId)));
    __jait_capture(2, (connector.sent[0]!.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_359_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_14008 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_14008();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { allowedSenders: ["111"] });
    await mgr.start("fake");

    __jait_capture(0, (await mgr.notify({ title: "T", body: "B" })));
    __jait_capture(1, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_368_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_14008 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_14008();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, allowedSenders: ["111"] });

    __jait_capture(0, (await mgr.notify({ title: "T", body: "B" })));
    __jait_capture(1, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_376_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_14008 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_14008();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    mgr.setConfig("fake", { notifications: true, respondToAll: true, allowedSenders: [] });
    await mgr.start("fake");

    __jait_capture(0, (await mgr.notify({ title: "T", body: "B" })));
    __jait_capture(1, (connector.sent));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_412_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (lastText(connector)));
    __jait_capture(1, (lastText(connector)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_423_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector, seen } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model 2", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(0, (mgr.getConfig("fake").model));

    connector.emit({ text: "hello", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(1, (seen));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_436_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model gpt-4o", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(0, (mgr.getConfig("fake").model));

    connector.emit({ text: "/model reset", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(1, (mgr.getConfig("fake").model));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_449_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/model nonsense-9000", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (lastText(connector)));
    __jait_captureType(1, (mgr.getConfig("fake").model));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_460_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/notifications on", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(0, (mgr.getConfig("fake").notifications));

    connector.emit({ text: "/notifications off", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(1, (mgr.getConfig("fake").notifications));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_473_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCommandManager(db: SqliteDatabase) {
    const models = [
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
      { id: "llama3", label: "Llama 3", group: "Ollama" },
    ];
    const seen: (string | undefined)[] = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.model); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const lastText = (connector: FakeConnector) => connector.sent.at(-1)?.text ?? "";
const __jait_hook_15684 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_15684();
try {
await (async()=>{

    const { mgr, connector, seen } = makeCommandManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "/help", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (seen));
    __jait_capture(1, (lastText(connector)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_489_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_19241 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_19241();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    __jait_capture(0, (connector.menu?.map((c) => c.name)));
    for (const entry of connector.menu ?? []) {
      __jait_capture(1, (entry.description.length));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_499_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_19241 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_19241();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    connector.setCommandMenu = async () => { throw new Error("Telegram said no"); };

    await __jait_captureResolved(0, (mgr.start("fake")));
    __jait_capture(1, (mgr.list()[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_507_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_19241 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_19241();
try {
await (async()=>{

    const { mgr, connector } = makeManager(sqlite);
    await mgr.start("fake");

    for (const entry of connector.menu ?? []) {
      __jait_capture(0, (parseCommand(`/${entry.name}`)), ({ command: entry.name }));
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_536_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, label: `Model ${i}`, group: "OpenAI" }));
function makeDialogManager(db: SqliteDatabase, supportsChoices: boolean) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_20435 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_20435();
try {
await (async()=>{

    const { mgr, connector } = makeDialogManager(sqlite, true);
    mgr.setConfig("fake", { model: "m1" });
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    const sent = connector.sent.at(-1)!;
    __jait_capture(0, (sent.text));
    __jait_capture(1, (sent.choices?.length)); // 24 models + reset
    __jait_capture(2, (sent.choices?.[1]));
    __jait_capture(3, (sent.choices?.at(-1)));
    __jait_capture(4, (sent.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_552_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, label: `Model ${i}`, group: "OpenAI" }));
function makeDialogManager(db: SqliteDatabase, supportsChoices: boolean) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_20435 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_20435();
try {
await (async()=>{

    const { mgr, connector } = makeDialogManager(sqlite, false);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    const sent = connector.sent.at(-1)!;
    __jait_captureType(0, (sent.choices));
    __jait_capture(1, (sent.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_564_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = Array.from({ length: 30 }, (_, i) => ({ id: `m${i}`, label: `Model ${i}`, group: "OpenAI" }));
function makeDialogManager(db: SqliteDatabase, supportsChoices: boolean) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_20435 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_20435();
try {
await (async()=>{

    const { mgr, connector } = makeDialogManager(sqlite, true);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    const choice = connector.sent.at(-1)!.choices![3]!;

    // A tapped button re-enters through the same path as a typed command.
    connector.emit({ text: choice.value, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (mgr.getConfig("fake").model));
    __jait_capture(1, (connector.sent.at(-1)!.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_618_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    __jait_capture(0, (sent.text));
    __jait_capture(1, (sent.choices?.map((c) => c.label)));
    __jait_capture(2, (sent.choices?.[0]!.value));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_631_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider OpenAI");

    __jait_capture(0, (sent.text));
    __jait_capture(1, (modelLabels(sent)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_641_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider all");

    __jait_capture(0, (modelLabels(sent)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_652_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, true, [mixed[0]!, mixed[1]!]);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    __jait_capture(0, (sent.text));
    __jait_capture(1, (modelLabels(sent)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_662_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, false);
    await mgr.start("fake");

    const listed = await send(connector, "/model");
    __jait_capture(0, (listed.text));

    const confirmed = await send(connector, "/model llama3");
    __jait_capture(1, (confirmed.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_673_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const mixed = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "gpt-5", label: "GPT-5", group: "OpenAI" },
    { id: "anthropic/claude", label: "Claude", group: "OpenRouter" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeMixedManager(db: SqliteDatabase, supportsChoices: boolean, models = mixed) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: supportsChoices });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_23206 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_23206();
try {
await (async()=>{

    const { mgr, connector } = makeMixedManager(sqlite, true);
    await mgr.start("fake");

    const sent = await send(connector, "/model provider Anthropic");

    __jait_capture(0, (sent.text));
    __jait_captureType(1, (sent.choices));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_685_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (groupModelsByProvider([
      { id: "a", group: "Ollama" },
      { id: "b", group: "OpenAI" },
      { id: "c", group: "OpenAI" },
      { id: "d" },
    ])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_723_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeManager2(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_27012 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_27012();
try {
await (async()=>{

    const { mgr, connector } = makeManager2(sqlite);
    await mgr.start("fake");

    const step2 = await send(connector, "/model provider OpenAI");
    const back = step2.choices?.find((c) => c.label.includes("Back"));
    __jait_capture(0, (back?.value));

    // Following it lands on the provider step again.
    const step1 = await send(connector, back!.value);
    __jait_capture(1, (step1.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_736_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "llama3", label: "Llama 3", group: "Ollama" },
  ];
function makeManager2(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_27012 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_27012();
try {
await (async()=>{

    const { mgr, connector } = makeManager2(sqlite);
    await mgr.start("fake");

    const step1 = await send(connector, "/model");

    __jait_capture(0, (step1.choices?.some((c) => c.label.includes("Back"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_747_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (buildCliPrompt([
      { role: "system", content: "ignored" },
      { role: "user", content: "list the failing tests" },
    ] as AgentMessage[])));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_754_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const prompt = buildCliPrompt([
      { role: "user", content: "what is in src?" },
      { role: "assistant", content: "Three files." },
      { role: "user", content: "and the biggest one?" },
    ] as AgentMessage[]);

    __jait_capture(0, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_766_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const history = Array.from({ length: 20 }, (_, i) => ({ role: "user", content: `m${i}` }));
    const prompt = buildCliPrompt(history as AgentMessage[], 4);

    __jait_capture(0, (prompt));
    __jait_capture(1, (prompt));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_809_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "opus", label: "Opus", group: "Claude Code", provider: "claude-code-1" },
  ];
function makeManager3(db: SqliteDatabase) {
    const seen: Array<{ model?: string; modelProvider?: string }> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) {
          seen.push({ model: ctx.model, modelProvider: ctx.modelProvider });
          return "reply";
        },
      },
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_29733 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_29733();
try {
await (async()=>{

    const { mgr, connector } = makeManager3(sqlite);
    await mgr.start("fake");

    const sent = await send(connector, "/model");

    __jait_capture(0, (sent.choices?.map((c) => c.label)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_818_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "opus", label: "Opus", group: "Claude Code", provider: "claude-code-1" },
  ];
function makeManager3(db: SqliteDatabase) {
    const seen: Array<{ model?: string; modelProvider?: string }> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) {
          seen.push({ model: ctx.model, modelProvider: ctx.modelProvider });
          return "reply";
        },
      },
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_29733 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_29733();
try {
await (async()=>{

    const { mgr, connector, seen } = makeManager3(sqlite);
    await mgr.start("fake");

    const confirmation = await send(connector, "/model opus");
    __jait_capture(0, (mgr.getConfig("fake")));
    __jait_capture(1, (confirmation.text));

    await send(connector, "hello");
    __jait_capture(2, (seen.at(-1)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_830_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "opus", label: "Opus", group: "Claude Code", provider: "claude-code-1" },
  ];
function makeManager3(db: SqliteDatabase) {
    const seen: Array<{ model?: string; modelProvider?: string }> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) {
          seen.push({ model: ctx.model, modelProvider: ctx.modelProvider });
          return "reply";
        },
      },
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_29733 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_29733();
try {
await (async()=>{

    const { mgr, connector, seen } = makeManager3(sqlite);
    await mgr.start("fake");

    await send(connector, "/model opus");
    await send(connector, "/model gpt-4o");
    __jait_capture(0, (mgr.getConfig("fake").modelProvider));

    await send(connector, "hello");
    __jait_capture(1, (seen.at(-1)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_842_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const models = [
    { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    { id: "opus", label: "Opus", group: "Claude Code", provider: "claude-code-1" },
  ];
function makeManager3(db: SqliteDatabase) {
    const seen: Array<{ model?: string; modelProvider?: string }> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: {
        async generate(_history, ctx) {
          seen.push({ model: ctx.model, modelProvider: ctx.modelProvider });
          return "reply";
        },
      },
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_29733 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_29733();
try {
await (async()=>{

    const { mgr, connector } = makeManager3(sqlite);
    await mgr.start("fake");

    await send(connector, "/model opus");
    await send(connector, "/model reset");

    __jait_capture(0, (mgr.getConfig("fake")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_876_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCountingManager(db: SqliteDatabase, models = [{ id: "m1", label: "M1", group: "OpenAI" }]) {
    let calls = 0;
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return models; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, calls: () => calls };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
  };
const __jait_hook_32452 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_32452();
try {
await (async()=>{

    const { mgr, connector, calls } = makeCountingManager(sqlite, [
      { id: "m1", label: "M1", group: "OpenAI" },
      { id: "m2", label: "M2", group: "Ollama" },
    ]);
    await mgr.start("fake");

    await send(connector, "/model");
    await send(connector, "/model provider OpenAI");
    await send(connector, "/model");
    await send(connector, "/model m1");

    __jait_capture(0, (calls()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_891_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeCountingManager(db: SqliteDatabase, models = [{ id: "m1", label: "M1", group: "OpenAI" }]) {
    let calls = 0;
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return models; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector, calls: () => calls };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
  };
const __jait_hook_32452 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_32452();
try {
await (async()=>{

    const { mgr, connector, calls } = makeCountingManager(sqlite, []);
    await mgr.start("fake");

    await send(connector, "/model");
    await send(connector, "/model");

    __jait_capture(0, (calls()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_925_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeManager4(db: SqliteDatabase, models: { id: string; label?: string; group?: string; provider?: string }[]) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_34066 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_34066();
try {
await (async()=>{

    const { mgr, connector } = makeManager4(sqlite, [
      { id: "default", label: "Default", group: "Claude Code", provider: "claude-code-1" },
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    ]);
    await mgr.start("fake");

    const sent = await send(connector, "/model default");

    __jait_capture(0, (mgr.getConfig("fake")));
    __jait_capture(1, (sent.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_938_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeManager4(db: SqliteDatabase, models: { id: string; label?: string; group?: string; provider?: string }[]) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_34066 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_34066();
try {
await (async()=>{

    const { mgr, connector } = makeManager4(sqlite, [{ id: "gpt-4o", label: "GPT-4o", group: "OpenAI" }]);
    await mgr.start("fake");
    await send(connector, "/model gpt-4o");

    const sent = await send(connector, "/model default");

    __jait_capture(0, (mgr.getConfig("fake")));
    __jait_capture(1, (sent.text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_949_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeManager4(db: SqliteDatabase, models: { id: string; label?: string; group?: string; provider?: string }[]) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => models,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    return { mgr, connector };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_34066 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_34066();
try {
await (async()=>{

    const { mgr, connector } = makeManager4(sqlite, [
      { id: "reset", label: "Reset", group: "Odd" },
      { id: "gpt-4o", label: "GPT-4o", group: "OpenAI" },
    ]);
    await mgr.start("fake");
    await send(connector, "/model gpt-4o");

    await send(connector, "/model reset");

    __jait_capture(0, (mgr.getConfig("fake")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_967_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_36370 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_36370();
try {
await (async()=>{

    let calls = 0;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return [{ id: "m1", label: "M1", group: "OpenAI" }]; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    await mgr.start("fake");

    mgr.warmModelCatalogue();
    await new Promise((r) => setTimeout(r, 10));
    __jait_capture(0, (calls));

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    // Served from the warmed cache, not a second resolution.
    __jait_capture(1, (calls));
    __jait_capture(2, (connector.sent.at(-1)!.choices?.length));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_992_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_36370 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_36370();
try {
await (async()=>{

    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { throw new Error("provider down"); },
      replyGenerator: echoGenerator,
      log: () => {},
    });
    mgr.register(new FakeConnector());

    __jait_thrown(0, () => mgr.warmModelCatalogue());
    await new Promise((r) => setTimeout(r, 10));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1011_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_37837 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_37837();
try {
await (async()=>{

    let calls = 0;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      resolveModels: async () => { calls += 1; return [{ id: `m${calls}`, label: `M${calls}`, group: "OpenAI" }]; },
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    Object.defineProperty(connector, "supportsChoices", { value: true });
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(0, (calls));

    // A provider that missed its budget has answered — the partial list is stale.
    mgr.invalidateModelCache();

    connector.emit({ text: "/model", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(1, (calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1063_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeApprovalManager(db: SqliteDatabase) {
    const consentManager = new ConsentManager({ db, timeoutMs: 1000 });
    const seen: Array<boolean | undefined> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      consentManager,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.autoApprove); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consentManager, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_38891 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_38891();
try {
await (async()=>{

    const { mgr, connector, consentManager, seen } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "do something");

    __jait_capture(0, (seen));
    __jait_capture(1, (consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1073_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeApprovalManager(db: SqliteDatabase) {
    const consentManager = new ConsentManager({ db, timeoutMs: 1000 });
    const seen: Array<boolean | undefined> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      consentManager,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.autoApprove); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consentManager, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_38891 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_38891();
try {
await (async()=>{

    const { mgr, connector, consentManager, seen } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "/approvals ask");
    __jait_capture(0, (mgr.getConfig("fake").autoApprove));

    await send(connector, "do something");
    __jait_capture(1, (seen));
    __jait_capture(2, (consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1085_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeApprovalManager(db: SqliteDatabase) {
    const consentManager = new ConsentManager({ db, timeoutMs: 1000 });
    const seen: Array<boolean | undefined> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      consentManager,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.autoApprove); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consentManager, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_38891 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_38891();
try {
await (async()=>{

    const { mgr, connector, consentManager } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    await send(connector, "/approvals ask");
    await send(connector, "do something");
    const confirmation = await send(connector, "/approvals auto");

    __jait_capture(0, (mgr.getConfig("fake").autoApprove));
    __jait_capture(1, (confirmation.text));

    await send(connector, "do something else");
    __jait_capture(2, (consentManager.isApproveAllEnabledForSession("channel:fake:chat-1")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1100_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeApprovalManager(db: SqliteDatabase) {
    const consentManager = new ConsentManager({ db, timeoutMs: 1000 });
    const seen: Array<boolean | undefined> = [];
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      consentManager,
      replyGenerator: {
        async generate(_history, ctx) { seen.push(ctx.autoApprove); return "reply"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, consentManager, seen };
  }
const send = async (connector: FakeConnector, text: string) => {
    connector.emit({ text, isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));
    return connector.sent.at(-1)!;
  };
const __jait_hook_38891 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_38891();
try {
await (async()=>{

    const { mgr, connector } = makeApprovalManager(sqlite);
    await mgr.start("fake");

    __jait_capture(0, ((await send(connector, "/approvals")).text));
    __jait_capture(1, ((await send(connector, "/status")).text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1110_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (irreversibleReasonFor({ command: "rm -rf /home/user/project" })));
    __jait_captureType(1, (irreversibleReasonFor({ command: "ls -la" })));
    __jait_captureType(2, (irreversibleReasonFor({ path: "/tmp/x" })));
    __jait_captureType(3, (irreversibleReasonFor(null)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1122_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_41958 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_41958();
try {
await (async()=>{

    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate() { await blocked; return "done"; },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "first", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    connector.emit({ text: "second", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));

    __jait_capture(0, (connector.sent.map((m) => m.text)));

    release();
    await new Promise((r) => setTimeout(r, 30));
    __jait_capture(1, (connector.sent.filter((m) => m.text === "done")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1148_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_41958 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_41958();
try {
await (async()=>{

    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "one", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 30));
    connector.emit({ text: "two", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 30));

    __jait_capture(0, (connector.sent.some((m) => m.text.includes("Still working"))));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1189_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeProgressManager(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate(_history, ctx) {
          ctx.onProgress?.("• search");
          ctx.onProgress?.("  ✓ search");
          await new Promise((r) => setTimeout(r, 5));
          return "found it";
        },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_43668 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_43668();
try {
await (async()=>{

    const { mgr, connector } = makeProgressManager(sqlite);
    await mgr.start("fake");

    connector.emit({ text: "find something", isSelfChat: true });
    const deadline = Date.now() + 20_000; while (!connector.sent.some(m => m.text === "found it") || !connector.live.some(m => m.text.includes("✅ Done"))) { if (Date.now() >= deadline) throw new Error("Progress reply did not complete"); await new Promise(r => setTimeout(r, 5)); }

    __jait_capture(0, (connector.live));
    __jait_capture(1, (connector.live[0]!.text));
    __jait_capture(2, (connector.live[0]!.text));
    // The answer is still its own message.
    __jait_capture(3, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1203_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeProgressManager(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate(_history, ctx) {
          ctx.onProgress?.("• search");
          ctx.onProgress?.("  ✓ search");
          await new Promise((r) => setTimeout(r, 5));
          return "found it";
        },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_43668 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_43668();
try {
await (async()=>{

    const { mgr, connector } = makeProgressManager(sqlite);
    mgr.setConfig("fake", { progress: false });
    await mgr.start("fake");

    connector.emit({ text: "find something", isSelfChat: true });
    const deadline = Date.now() + 20_000;
    while (!connector.sent.some((message) => message.text === "found it")) {
      if (Date.now() >= deadline) throw new Error("Quiet progress reply did not complete");
      await new Promise((resolve) => setTimeout(resolve, 5));
    }

    __jait_capture(0, (connector.live));
    __jait_capture(1, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1215_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeProgressManager(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate(_history, ctx) {
          ctx.onProgress?.("• search");
          ctx.onProgress?.("  ✓ search");
          await new Promise((r) => setTimeout(r, 5));
          return "found it";
        },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_43668 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_43668();
try {
await (async()=>{

    const plain = { id: "x", label: "X" } as unknown as Parameters<typeof ProgressReporter.supportedBy>[0];
    __jait_capture(0, (ProgressReporter.supportedBy(plain)));
    __jait_capture(1, (ProgressReporter.supportedBy(new FakeConnector())));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1221_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function makeProgressManager(db: SqliteDatabase) {
    const mgr = new ChannelManager({
      sqlite: db,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate(_history, ctx) {
          ctx.onProgress?.("• search");
          ctx.onProgress?.("  ✓ search");
          await new Promise((r) => setTimeout(r, 5));
          return "found it";
        },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector };
  }
const __jait_hook_43668 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_43668();
try {
await (async()=>{

    const many = Array.from({ length: 12 }, (_, i) => `• step${i}`);
    const text = formatProgress(many);

    __jait_capture(0, (text));
    __jait_capture(1, (text));
    __jait_capture(2, (text));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1235_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_46164 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_46164();
try {
await (async()=>{

    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: { async generate() { await blocked; return "done"; } },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "hello", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 15));
    __jait_capture(0, (connector.typingActive));

    release();
    await new Promise((r) => setTimeout(r, 20));
    __jait_capture(1, (connector.typingActive));
    __jait_capture(2, (connector.typingStarts));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1257_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_46164 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_46164();
try {
await (async()=>{

    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: { async generate() { throw new Error("model exploded"); } },
      log: () => {},
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "hello", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (connector.typingActive));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1279_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_47601 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_47601();
try {
await (async()=>{

    let seen: ReplyContext | null = null;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: { async generate(_h, ctx) { seen = ctx; return "ok"; } },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");
    mgr.setConfig("fake", { timeZone: "Asia/Tokyo" });

    connector.emit({ text: "remind me tomorrow at 5", isSelfChat: true, conversationId: "chat-9" });
    await new Promise((r) => setTimeout(r, 20));

    __jait_capture(0, (seen!.contextBlock));
    __jait_capture(1, (seen!.contextBlock));
    __jait_capture(2, (seen!.contextBlock));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1304_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_48556 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_48556();
try {
await (async()=>{

    let turns = 0;
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: { async generate() { turns += 1; return "should not run"; } },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    await mgr.deliver({ channelId: "fake", conversationId: "chat-1", text: "Anlage prüfen" });

    __jait_capture(0, (connector.sent.map((m) => m.text)));
    __jait_capture(1, (turns));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1321_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_48556 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_48556();
try {
await (async()=>{

    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: echoGenerator,
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    await mgr.deliver({ channelId: "fake", conversationId: "chat-1", prompt: "What is on today?" });

    __jait_capture(0, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1336_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_48556 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_48556();
try {
await (async()=>{

    let release: () => void = () => {};
    const blocked = new Promise<void>((resolve) => { release = resolve; });
    const mgr = new ChannelManager({
      sqlite,
      resolveLLM: () => fakeLLM,
      replyGenerator: {
        async generate(history) {
          const last = [...history].reverse().find((m) => m.role === "user");
          if (last?.content === "slow question") await blocked;
          return `answer to ${String(last?.content)}`;
        },
      },
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    await mgr.start("fake");

    connector.emit({ text: "slow question", isSelfChat: true });
    await new Promise((r) => setTimeout(r, 10));
    const delivery = mgr.deliver({ channelId: "fake", conversationId: "chat-1", prompt: "reminder" });

    __jait_capture(0, (connector.sent));
    release();
    await delivery;

    __jait_capture(1, (connector.sent.map((m) => m.text)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1368_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_48556 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_48556();
try {
await (async()=>{

    const { mgr } = makeManager(sqlite);
    await __jait_rejected(0, mgr.deliver({ channelId: "fake", conversationId: "c", text: "x" }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1374_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
const __jait_hook_48556 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_48556();
try {
await (async()=>{

    const { mgr } = makeManager(sqlite);
    await __jait_rejected(0, mgr.deliver({ channelId: "signal", conversationId: "c", text: "x" }));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1382_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (chooseFallbackModel({ model: "gpt-5", fallbackModel: "claude-sonnet-5" }, "gpt-5")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1387_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (chooseFallbackModel(
      { model: "gpt-5", fallbackModel: "opus", fallbackModelProvider: "claude-code" },
    )));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1393_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (chooseFallbackModel({ model: "gpt-5" }, "claude-sonnet-5")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1398_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Nothing else to try — the same credential would be rejected again.
    __jait_captureType(0, (chooseFallbackModel({ model: "gpt-5" }, "gpt-5")));
    __jait_captureType(1, (chooseFallbackModel({}, "gpt-5")));
    __jait_captureType(2, (chooseFallbackModel({})));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1407_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (looksLikeCliAuthFailure("Unauthorized: please run `claude login`")));
    __jait_capture(1, (looksLikeCliAuthFailure("Your session expired")));
    __jait_capture(2, (looksLikeCliAuthFailure("API key invalid")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1413_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (looksLikeCliAuthFailure("The command exited with status 1")));
    __jait_capture(1, (looksLikeCliAuthFailure("No such file or directory")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1455_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function sseResponse(text: string): Response {
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
function managerWithRealGenerator(fetchImpl: typeof fetch) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const mgr = new ChannelManager({
      sqlite,
      // Each requested model becomes its own endpoint, so the fake server can
      // tell which one the turn is asking for.
      resolveLLM: (requested) => ({
        openaiApiKey: "key",
        openaiBaseUrl: `http://llm.test/${requested ?? "gateway-default"}`,
        openaiModel: requested ?? "gateway-default",
        contextWindow: 8000,
      }),
      resolveAuth: () => ({ userId: "owner", model: "gateway-default" }),
      log: () => {},
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, restore: () => { globalThis.fetch = original; } };
  }
const __jait_hook_53083 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_53083();
try {
await (async()=>{

    const seen: string[] = [];
    const { mgr, connector, restore } = managerWithRealGenerator(async (input) => {
      const url = String(input);
      seen.push(url);
      if (url.includes("/broken-model")) {
        return new Response(JSON.stringify({ error: { message: "bad key" } }), { status: 401 });
      }
      return sseResponse("here is your answer");
    });

    try {
      await mgr.start("fake");
      mgr.setConfig("fake", { model: "broken-model", fallbackModel: "rescue-model" });

      connector.emit({ text: "hello", isSelfChat: true });
      await new Promise((r) => setTimeout(r, 60));

      __jait_capture(0, (seen.some((u) => u.includes("/broken-model"))));
      __jait_capture(1, (seen.some((u) => u.includes("/rescue-model"))));
      __jait_capture(2, (connector.sent.map((m) => m.text)));
    } finally {
      restore();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1484_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function sseResponse(text: string): Response {
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
function managerWithRealGenerator(fetchImpl: typeof fetch) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const mgr = new ChannelManager({
      sqlite,
      // Each requested model becomes its own endpoint, so the fake server can
      // tell which one the turn is asking for.
      resolveLLM: (requested) => ({
        openaiApiKey: "key",
        openaiBaseUrl: `http://llm.test/${requested ?? "gateway-default"}`,
        openaiModel: requested ?? "gateway-default",
        contextWindow: 8000,
      }),
      resolveAuth: () => ({ userId: "owner", model: "gateway-default" }),
      log: () => {},
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, restore: () => { globalThis.fetch = original; } };
  }
const __jait_hook_53083 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_53083();
try {
await (async()=>{

    let calls = 0;
    const { mgr, connector, restore } = managerWithRealGenerator(async () => {
      calls += 1;
      return new Response(JSON.stringify({ error: { message: "upstream is down" } }), { status: 503 });
    });

    try {
      await mgr.start("fake");
      mgr.setConfig("fake", { model: "broken-model", fallbackModel: "rescue-model" });

      connector.emit({ text: "hello", isSelfChat: true });
      await new Promise((r) => setTimeout(r, 60));

      __jait_capture(0, (calls));
      __jait_capture(1, (connector.sent.some((m) => m.text.includes("couldn't authenticate"))));
    } finally {
      restore();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_channels_manager_test_ts_1505_3": {


class FakeConnector implements ChannelConnector {
  readonly id = "fake";
  readonly label = "Fake";
  events: ChannelConnectorEvents | null = null;
  sent: OutboundMessage[] = [];
  private _status: ChannelStatus = "stopped";

  /** Config handed over by the manager on start — asserted by the pairing tests. */
  startConfig: ChannelConfig | undefined;

  async start(events: ChannelConnectorEvents, config?: ChannelConfig) {
    this.events = events;
    this.startConfig = config;
    this._status = "connected";
    events.onStatus("connected");
  }
  async stop() { this._status = "stopped"; }
  async send(msg: OutboundMessage) { this.sent.push(msg); }

  /** Typing indicator: how often it was started, and whether it is running. */
  typingStarts = 0;
  typingActive = false;
  startTyping(_conversationId: string) {
    this.typingStarts += 1;
    this.typingActive = true;
    return () => { this.typingActive = false; };
  }

  /** Live progress message: id → current text, in send order. */
  live: { id: string; text: string }[] = [];
  private liveSeq = 0;
  async sendLive(_conversationId: string, text: string) {
    const id = `live-${++this.liveSeq}`;
    this.live.push({ id, text });
    return id;
  }
  async editLive(_conversationId: string, messageId: string, text: string) {
    const entry = this.live.find((m) => m.id === messageId);
    if (entry) entry.text = text;
  }

  /** Command menu published by the manager — asserted by the menu test. */
  menu: { name: string; description: string }[] | null = null;
  async setCommandMenu(commands: { name: string; description: string }[]) { this.menu = commands; }
  status() { return this._status; }
  currentQr() { return null; }

  emit(msg: Partial<InboundMessage> & { text: string }) {
    this.events?.onInbound({
      channelId: this.id,
      conversationId: msg.conversationId ?? "chat-1",
      senderId: msg.senderId ?? "111@s.whatsapp.net",
      text: msg.text,
      timestamp: Date.now(),
      fromMe: msg.fromMe ?? false,
      isSelfChat: msg.isSelfChat ?? false,
      ...msg,
    });
  }
}
const echoGenerator: ReplyGenerator = {
  async generate(history) {
    const last = [...history].reverse().find((m) => m.role === "user");
    return `echo: ${typeof last?.content === "string" ? last.content : ""}`;
  },
};
const fakeLLM: LLMConfig = { baseUrl: "http://localhost", apiKey: "x", model: "test" } as LLMConfig;
function makeManager(sqlite: SqliteDatabase) {
  const mgr = new ChannelManager({ sqlite, resolveLLM: () => fakeLLM, replyGenerator: echoGenerator });
  const connector = new FakeConnector();
  mgr.register(connector);
  return { mgr, connector };
}
function modelLabels(sent: OutboundMessage): string[] {
  return (sent.choices ?? [])
    .filter((c) => !/^(⬅️|↩️|All models)/.test(c.label))
    .map((c) => c.label);
}
/*__jait_scope_open__*/{
let sqlite: SqliteDatabase;
function sseResponse(text: string): Response {
    const body = [
      `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}`,
      "",
      "data: [DONE]",
      "",
    ].join("\n");
    return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
  }
function managerWithRealGenerator(fetchImpl: typeof fetch) {
    const original = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const mgr = new ChannelManager({
      sqlite,
      // Each requested model becomes its own endpoint, so the fake server can
      // tell which one the turn is asking for.
      resolveLLM: (requested) => ({
        openaiApiKey: "key",
        openaiBaseUrl: `http://llm.test/${requested ?? "gateway-default"}`,
        openaiModel: requested ?? "gateway-default",
        contextWindow: 8000,
      }),
      resolveAuth: () => ({ userId: "owner", model: "gateway-default" }),
      log: () => {},
    });
    const connector = new FakeConnector();
    mgr.register(connector);
    return { mgr, connector, restore: () => { globalThis.fetch = original; } };
  }
const __jait_hook_53083 = async () => { sqlite = await openRawSqlite(":memory:"); };
await __jait_hook_53083();
try {
await (async()=>{

    const { mgr, connector, restore } = managerWithRealGenerator(async (input) =>
      String(input).includes("/broken-model")
        ? new Response("{}", { status: 401 })
        : sseResponse("answered"));

    try {
      await mgr.start("fake");
      mgr.setConfig("fake", { model: "broken-model", fallbackModel: "rescue-model" });

      connector.emit({ text: "hello", isSelfChat: true });
      await new Promise((r) => setTimeout(r, 60));

      __jait_capture(0, (mgr.getConfig("fake").model));
    } finally {
      restore();
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
