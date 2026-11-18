// Translated fixture from packages/gateway/src/providers/acp-provider-errors.test.ts; expected literals are in tail_static.rs.
import { AcpProvider } from "../../../../packages/gateway/src/providers/acp-provider.js";
import type { ProviderEvent } from "../../../../packages/gateway/src/providers/contracts.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/acp-provider-errors.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_51_3_each0": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const scenario = "legacy";

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await __jait_rejected(0, provider.sendTurn(session.id, "test"), (capacityError));
      __jait_capture(1, (events.filter((event) => event.type === "token").map((event) => event.content).join("")));
      __jait_capture(2, (events.filter((event) => event.type === "session.error")), ([{ type: "session.error", sessionId: session.id, error: capacityError }]));
      __jait_capture(3, (events.some((event) => event.type === "turn.completed")));
      __jait_capture(4, (session.status));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_51_3_each1": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const scenario = "notification";

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await __jait_rejected(0, provider.sendTurn(session.id, "test"), (capacityError));
      __jait_capture(1, (events.filter((event) => event.type === "token").map((event) => event.content).join("")));
      __jait_capture(2, (events.filter((event) => event.type === "session.error")), ([{ type: "session.error", sessionId: session.id, error: capacityError }]));
      __jait_capture(3, (events.some((event) => event.type === "turn.completed")));
      __jait_capture(4, (session.status));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_51_3_each2": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const scenario = "result";

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await __jait_rejected(0, provider.sendTurn(session.id, "test"), (capacityError));
      __jait_capture(1, (events.filter((event) => event.type === "token").map((event) => event.content).join("")));
      __jait_capture(2, (events.filter((event) => event.type === "session.error")), ([{ type: "session.error", sessionId: session.id, error: capacityError }]));
      __jait_capture(3, (events.some((event) => event.type === "turn.completed")));
      __jait_capture(4, (session.status));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_65_3": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript("diagnostic")] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "diagnostic", workingDirectory: process.cwd() });
      await __jait_rejected(0, provider.sendTurn(session.id, "test"));
      __jait_capture(1, (events.filter((event) => event.type === "session.error")), ([{
        type: "session.error", sessionId: session.id,
        error: `${capacityError} Diagnostic: TypeError; RPC code -32603; RPC method turn/start; resume (index.js:123:4)`,
      }]));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_79_3": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript("unsafe-diagnostic")] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "unsafe-diagnostic", workingDirectory: process.cwd() });
      await __jait_rejected(0, provider.sendTurn(session.id, "test"), (`${capacityError} Diagnostic: Error`));
      __jait_capture(1, (events.filter((event) => event.type === "session.error")), ([
        { type: "session.error", sessionId: session.id, error: `${capacityError} Diagnostic: Error` },
      ]));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_92_3_each0": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const scenario = "success";

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await provider.sendTurn(session.id, "test");
      __jait_capture(0, (events.some((event) => event.type === "session.error")));
      __jait_capture(1, (events.some((event) => event.type === "turn.completed")));
      __jait_capture(2, (events.filter((event) => event.type === "token").map((event) => event.content).join("")), ("Checking now. " + (scenario === "quote" ? capacityError : "")));
    } finally { unsubscribe(); await provider.dispose(); }
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_providers_acp_provider_errors_test_ts_92_3_each1": {


const capacityError = "Selected model is at capacity. Please try a different model.";
const failureMeta = {
  jetbrains: { air: { version: 1, sessionFailure: {
    id: "turn:error", severity: "error", title: capacityError,
  } } },
};
function agentScript(scenario: string): string {
  return `
    const readline = require("node:readline");
    const scenario = ${JSON.stringify(scenario)};
    const errorText = ${JSON.stringify(capacityError)};
    const meta = ${JSON.stringify(failureMeta)};
    const send = (value) => process.stdout.write(JSON.stringify(value) + "\\n");
    readline.createInterface({ input: process.stdin }).on("line", (line) => {
      const request = JSON.parse(line);
      let result = {};
      if (request.method === "initialize") {
        result = { protocolVersion: 1, agentCapabilities: {}, authMethods: [] };
      } else if (request.method === "session/new") {
        result = { sessionId: "fake-session" };
      } else if (request.method === "session/prompt") {
        const update = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "fake-session", update } });
        update({ sessionUpdate: "agent_message_chunk", messageId: "progress", content: { type: "text", text: "Checking now. " } });
        if (scenario === "legacy") {
          update({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: errorText + "\\n\\n" } });
        } else if (scenario === "notification") {
          update({ sessionUpdate: "session_info_update", _meta: meta });
        } else if (scenario === "quote") {
          update({ sessionUpdate: "agent_message_chunk", messageId: "reply", content: { type: "text", text: errorText } });
        }
        if (scenario === "diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "TypeError", code: -32603, method: "turn/start", frames: ["resume (index.js:123:4)", "secret /private/path:1:2"] };
        }
        if (scenario === "unsafe-diagnostic") {
          meta.jetbrains.air.sessionFailure.jaitDiagnostic = { name: "Error", code: "secret", method: "secret /private/path", frames: ["secret /private/path:1:2"] };
        }
        result = { stopReason: "end_turn", ...(["result", "diagnostic", "unsafe-diagnostic"].includes(scenario) ? { _meta: meta } : {}) };
      }
      send({ jsonrpc: "2.0", id: request.id, result });
    });
  `;
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const scenario = "quote";

try {
await (async()=>{

    const provider = new AcpProvider({ id: "codex", name: "Codex", description: "Test", command: process.execPath, args: ["-e", agentScript(scenario)] });
    const events: ProviderEvent[] = [];
    const unsubscribe = provider.onEvent((event) => events.push(event));
    try {
      const session = await provider.startSession({ threadId: "error-repro", workingDirectory: process.cwd() });
      await provider.sendTurn(session.id, "test");
      __jait_capture(0, (events.some((event) => event.type === "session.error")));
      __jait_capture(1, (events.some((event) => event.type === "turn.completed")));
      __jait_capture(2, (events.filter((event) => event.type === "token").map((event) => event.content).join("")), ("Checking now. " + (scenario === "quote" ? capacityError : "")));
    } finally { unsubscribe(); await provider.dispose(); }
  
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
