// Translated fixture from packages/gateway/src/security/consent-executor.test.ts; expected literals are in tail_static.rs.
import type { ToolContext, ToolDefinition, ToolResult } from "../../../../packages/gateway/src/tools/contracts.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { ConsentAwareExecutor } from "../../../../packages/gateway/src/security/consent-executor.js";
import { ConsentManager } from "../../../../packages/gateway/src/security/consent-manager.js";
import { TrustEngine } from "../../../../packages/gateway/src/security/trust-engine.js";
import { getProfile } from "../../../../packages/gateway/src/security/tool-profiles.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/security/consent-executor.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_88_3_each0": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);

      __jait_capture(0, (consentManager.pendingCount));
      __jait_capture(1, (executions.get(tool.name).mock.calls));

      const request = consentManager.listPending()[0]!;
      __jait_capture(2, (request.toolName));
      __jait_capture(3, (request.summary));
      __jait_capture(4, (request.preview));
      __jait_capture(5, (request.risk));
      __jait_capture(6, (request.policy));

      consentManager.approve(request.id, "click", "Approved for focused test");

      const result = await promise;
      __jait_capture(7, (result.ok));
      __jait_capture(8, (executions.get(tool.name).mock.calls));
      __jait_capture(9, (executions.get(tool.name).mock.calls), ([context.actionId,context.sessionId]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_88_3_each1": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);

      __jait_capture(0, (consentManager.pendingCount));
      __jait_capture(1, (executions.get(tool.name).mock.calls));

      const request = consentManager.listPending()[0]!;
      __jait_capture(2, (request.toolName));
      __jait_capture(3, (request.summary));
      __jait_capture(4, (request.preview));
      __jait_capture(5, (request.risk));
      __jait_capture(6, (request.policy));

      consentManager.approve(request.id, "click", "Approved for focused test");

      const result = await promise;
      __jait_capture(7, (result.ok));
      __jait_capture(8, (executions.get(tool.name).mock.calls));
      __jait_capture(9, (executions.get(tool.name).mock.calls), ([context.actionId,context.sessionId]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_88_3_each2": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);

      __jait_capture(0, (consentManager.pendingCount));
      __jait_capture(1, (executions.get(tool.name).mock.calls));

      const request = consentManager.listPending()[0]!;
      __jait_capture(2, (request.toolName));
      __jait_capture(3, (request.summary));
      __jait_capture(4, (request.preview));
      __jait_capture(5, (request.risk));
      __jait_capture(6, (request.policy));

      consentManager.approve(request.id, "click", "Approved for focused test");

      const result = await promise;
      __jait_capture(7, (result.ok));
      __jait_capture(8, (executions.get(tool.name).mock.calls));
      __jait_capture(9, (executions.get(tool.name).mock.calls), ([context.actionId,context.sessionId]));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_121_3_each0": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);
      const request = consentManager.listPending()[0]!;

      consentManager.reject(request.id, "click", "Not approved in this session");

      const result = await promise;
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message), (`User rejected ${tool.name}: Not approved in this session`));
      __jait_capture(2, (result.data));
      __jait_capture(3, (executions.get(tool.name).mock.calls));
      __jait_capture(4, (consentManager.pendingCount));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_121_3_each1": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);
      const request = consentManager.listPending()[0]!;

      consentManager.reject(request.id, "click", "Not approved in this session");

      const result = await promise;
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message), (`User rejected ${tool.name}: Not approved in this session`));
      __jait_capture(2, (result.data));
      __jait_capture(3, (executions.get(tool.name).mock.calls));
      __jait_capture(4, (consentManager.pendingCount));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_121_3_each2": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const tool = {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  };

try {
await (async()=>{

      const { consentManager, executor, executions } = createExecutor();

      const promise = executor.execute(tool.name, tool.input, context);
      const request = consentManager.listPending()[0]!;

      consentManager.reject(request.id, "click", "Not approved in this session");

      const result = await promise;
      __jait_capture(0, (result.ok));
      __jait_capture(1, (result.message), (`User rejected ${tool.name}: Not approved in this session`));
      __jait_capture(2, (result.data));
      __jait_capture(3, (executions.get(tool.name).mock.calls));
      __jait_capture(4, (consentManager.pendingCount));
    
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_142_3_each0": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const toolName = "terminal.run";

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "should-not-run",
    }));
    toolRegistry.register(createMockTool(toolName, registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const result = await executor.execute(toolName, { command: "git checkout -- src/AppLayout.tsx" }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (consentManager.pendingCount));
    __jait_capture(3, (registryExecute.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_142_3_each1": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const toolName = "execute";

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "should-not-run",
    }));
    toolRegistry.register(createMockTool(toolName, registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const result = await executor.execute(toolName, { command: "git checkout -- src/AppLayout.tsx" }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (consentManager.pendingCount));
    __jait_capture(3, (registryExecute.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_142_3_each2": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const toolName = "jait.terminal";

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "should-not-run",
    }));
    toolRegistry.register(createMockTool(toolName, registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const result = await executor.execute(toolName, { command: "git checkout -- src/AppLayout.tsx" }, context);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, (consentManager.pendingCount));
    __jait_capture(3, (registryExecute.mock.calls));
  
})();

} finally {

}
}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_174_3": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "ran",
    }));
    toolRegistry.register(createMockTool("gateway.redeploy", registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const fullAccessContext: ToolContext = {
      ...context,
      runtimeMode: "full-access",
    };

    const result = await executor.execute("gateway.redeploy", { version: "1.2.3" }, fullAccessContext);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (registryExecute.mock.calls));
    __jait_capture(2, (consentManager.pendingCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_204_3": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "ran",
    }));
    toolRegistry.register(createMockTool("terminal.run", registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const fullAccessContext: ToolContext = {
      ...context,
      runtimeMode: "full-access",
    };

    const result = await executor.execute(
      "terminal.run",
      { command: "git stash" },
      fullAccessContext,
    );

    __jait_capture(0, (result.ok));
    __jait_capture(1, (registryExecute.mock.calls));
    __jait_capture(2, (consentManager.pendingCount));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_240_3": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "local-registry",
    }));
    toolRegistry.register(
      createMockTool("terminal.run", registryExecute),
    );

    const delegate = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "remote-delegate",
    }));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
      delegate,
    });

    // terminal.run requires consent — approve it, then assert the delegate ran.
    const promise = executor.execute("terminal.run", { command: "whoami" }, context);
    const request = consentManager.listPending()[0]!;
    consentManager.approve(request.id, "click", "ok");
    const result = await promise;

    __jait_capture(0, (result.message));
    __jait_capture(1, (delegate.mock.calls));
    __jait_capture(2, (delegate.mock.calls), (["terminal.run",{ command: "whoami" },context,undefined]));
    __jait_capture(3, (registryExecute.mock.calls));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_security_consent_executor_test_ts_278_3": {


const context: ToolContext = {
  sessionId: "consent-sensitive-session",
  actionId: "consent-sensitive-action",
  projectRoot: "/tmp/jait-project",
  requestedBy: "test",
};
const consentSensitiveTools = [
  {
    name: "terminal.run",
    input: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedSummary: "Run command: bun test packages/gateway/src/security/consent-executor.test.ts",
    expectedPreview: { command: "bun test packages/gateway/src/security/consent-executor.test.ts" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "file.write",
    input: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedSummary: "Write to file: src/generated-consent-note.ts",
    expectedPreview: { path: "src/generated-consent-note.ts", content: "export const generated = true;\n" },
    expectedRisk: "medium",
    expectedConsentLevel: "once",
  },
  {
    name: "gateway.redeploy",
    input: { version: "1.2.3", skipCanary: true },
    expectedSummary: "Execute tool: gateway.redeploy",
    expectedPreview: { version: "1.2.3", skipCanary: true },
    expectedRisk: "high",
    expectedConsentLevel: "always",
  },
] as const;
function createMockTool(name: string, execute: ReturnType<typeof vi.fn>): ToolDefinition {
  return {
    name,
    description: `Mock ${name}`,
    tier: "standard",
    category: name === "gateway.redeploy" ? "gateway" : name.startsWith("file.") ? "filesystem" : "terminal",
    source: "builtin",
    parameters: {
      type: "object",
      properties: {},
    },
    execute: execute as ToolDefinition["execute"],
  };
}
function createExecutor() {
  const executions = new Map<string, ReturnType<typeof vi.fn>>();
  const toolRegistry = new ToolRegistry();

  for (const tool of consentSensitiveTools) {
    const execute = vi.fn(async (_input: unknown): Promise<ToolResult> => ({
      ok: true,
      message: `${tool.name} executed`,
      data: { toolName: tool.name },
    }));
    executions.set(tool.name, execute);
    toolRegistry.register(createMockTool(tool.name, execute));
  }

  const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
  const sessionApprovals = new Set<string>();
  const executor = new ConsentAwareExecutor({
    toolRegistry,
    consentManager,
    trustEngine: new TrustEngine(),
    permissions: getProfile("coding"),
    sessionApprovals,
    profileName: "coding",
  });

  return { consentManager, executor, executions, sessionApprovals };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const toolRegistry = new ToolRegistry();
    const registryExecute = vi.fn(async (): Promise<ToolResult> => ({
      ok: true,
      message: "local-registry",
    }));
    toolRegistry.register(createMockTool("terminal.run", registryExecute));

    const consentManager = new ConsentManager({ defaultTimeoutMs: 5000 });
    const executor = new ConsentAwareExecutor({
      toolRegistry,
      consentManager,
      trustEngine: new TrustEngine(),
      permissions: getProfile("coding"),
      sessionApprovals: new Set<string>(),
      profileName: "coding",
    });

    const promise = executor.execute("terminal.run", { command: "whoami" }, context);
    consentManager.approve(consentManager.listPending()[0]!.id, "click", "ok");
    const result = await promise;

    __jait_capture(0, (result.message));
    __jait_capture(1, (registryExecute.mock.calls));
  
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
