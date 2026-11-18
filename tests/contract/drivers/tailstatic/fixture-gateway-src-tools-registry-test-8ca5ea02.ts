// Translated fixture from packages/gateway/src/tools/registry.test.ts; expected literals are in tail_static.rs.
import type { AuditWriter } from "../../../../packages/gateway/src/services/audit.js";
import { SurfaceRegistry } from "../../../../packages/gateway/src/surfaces/registry.js";
import { createToolRegistry, type ToolRegistryDeps } from "../../../../packages/gateway/src/tools/index.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/registry.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_registry_test_ts_35_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = createToolRegistry(new SurfaceRegistry(), {
      projectService: {},
      repoService: {},
    } as any);

    __jait_capture(0, (registry.get("project.create")?.description));
    __jait_capture(1, (registry.get("project.assign_repository")?.description));
    __jait_capture(2, (registry.get("project.transfer")?.description));
    __jait_captureType(3, (registry.get("workspace.create")));
    __jait_captureType(4, (registry.get("workspace.assign_repository")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_48_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = createToolRegistry(new SurfaceRegistry(), {
      sessionSearchService: { search: () => [] },
    } as any);

    __jait_capture(0, (registry.get("session.search")?.description));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_56_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "builtin.echo",
      description: "echo text",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "ok" }),
    });

    __jait_capture(0, (registry.get("builtin.echo")));
    __jait_capture(1, (registry.listInfo()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_76_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.registerPluginTools(
      { id: "demo-plugin", displayName: "Demo Plugin" },
      [{
        name: "demo.echo",
        description: "echo from plugin",
        parameters: { type: "object", properties: {} },
        tier: "external",
        category: "external",
        risk: "high",
        defaultConsentLevel: "dangerous",
        execute: async () => ({ ok: true, message: "plugin" }),
      }],
    );

    __jait_capture(0, (registry.get("demo.echo")));
    __jait_capture(1, (registry.listInfo()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_115_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "echo",
      description: "echo text",
      parameters: {
        type: "object",
        properties: { text: { type: "string" } },
        required: ["text"],
      },
      execute: async (input: { text: string }) => ({ ok: true, message: input.text }),
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("echo", {}, context(), audit);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls));
    __jait_capture(3, (writes[0]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_144_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "ok.tool",
      description: "returns success",
      parameters: { type: "object", properties: {} },
      execute: async () => ({ ok: true, message: "done", data: { ok: true } }),
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("ok.tool", {}, context(), audit);

    __jait_capture(0, (result.ok));
    __jait_capture(1, ((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls));
    __jait_capture(2, (writes[0]));
    __jait_capture(3, (writes[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_169_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registry.register({
      name: "boom.tool",
      description: "throws",
      parameters: { type: "object", properties: {} },
      execute: async () => {
        throw new Error("kaboom");
      },
    });

    const writes: unknown[] = [];
    const audit = {
      write: vi.fn((entry: unknown) => {
        writes.push(entry);
        return "audit-id";
      }),
    } as unknown as AuditWriter;

    const result = await registry.execute("boom.tool", {}, context(), audit);

    __jait_capture(0, (result.ok));
    __jait_capture(1, (result.message));
    __jait_capture(2, ((audit.write as unknown as ReturnType<typeof vi.fn>).mock.calls));
    __jait_capture(3, (writes[0]));
    __jait_capture(4, (writes[1]));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_199_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open a live preview of the web application");
    registerDiscoveryTool(registry, "browser.click", "Click an interactive browser element");
    registerDiscoveryTool(registry, "network.scan", "Scan the local network for reachable hosts");
    registerDiscoveryTool(registry, "ssh.run", "Run a command on a remote server over SSH");
    registerDiscoveryTool(registry, "memory.search", "Search remembered preferences and durable facts");

    __jait_capture(0, (registry.search("show app")[0]?.name));
    __jait_capture(1, (registry.search("control browser").map((tool) => tool.name)));
    __jait_capture(2, (registry.search("scan my network")[0]?.name));
    __jait_capture(3, (registry.search("ssh machine")[0]?.name));
    __jait_capture(4, (registry.search("what do you remember about my preferences")[0]?.name));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_214_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open the application preview");
    registerDiscoveryTool(registry, "deploy.basic", "Deploy the current application");
    registerDiscoveryTool(registry, "deploy.preferred", "Deploy the current application safely", { priority: 50 });

    __jait_capture(0, (registry.search("prevew")[0]?.name));
    __jait_capture(1, (registry.search("deploy")[0]?.name));
    __jait_capture(2, (registry.search("deploy", { limit: 1 })));
    __jait_capture(3, (registry.search("deploy", { disabledTools: new Set(["deploy.preferred"]) })[0]?.name));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_226_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "todo", "Track multi-step work", { tier: "core" });
    registerDiscoveryTool(registry, "user.ask", "Ask the user for a decision", { tier: "core" });
    registerDiscoveryTool(registry, "tools.list", "List tools", { tier: "core" });
    registerDiscoveryTool(registry, "tools.search", "Search tools", { tier: "core" });
    registerDiscoveryTool(registry, "read", "Read project files", { tier: "core" });
    registerDiscoveryTool(registry, "preview.open", "Open a preview");
    registerDiscoveryTool(registry, "plugin.deploy", "Deploy through a plugin", { tier: "external", source: "plugin:deploy" });
    registerDiscoveryTool(registry, "mcp.github.issue", "Create a GitHub issue", { tier: "external", source: "mcp" });

    __jait_capture(0, (registry.listForMcp().map((tool) => tool.name)));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_255_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const deps: ToolRegistryDeps = { agentGithubAppService: {} as any };
    const early = createToolRegistry(new SurfaceRegistry(), deps);
    __jait_capture(0, (early.listNames()));

    Object.assign(deps, { startedAt: Date.now() } satisfies Partial<ToolRegistryDeps>);
    const late = createToolRegistry(new SurfaceRegistry(), deps);

    __jait_capture(1, (late.listNames()));
    // The old wiring (a late literal omitting the service) is what produced the
    // unknown-tool failure for an advertised tool.
    const drifted = createToolRegistry(new SurfaceRegistry(), { startedAt: Date.now() });
    __jait_capture(2, (drifted.listNames()));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_271_1": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}

try {
await (async()=>{

  const registry = new ToolRegistry();
  registerDiscoveryTool(registry, "file.read", "Read constructor source files");
  __jait_thrown(0, () => registry.rankSearch("inspect constructor source"));
  __jait_capture(1, (registry.search("constructor")[0]?.name));

})();

} finally {

}


break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_280_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    const context = Array.from({ length: 8000 }, (_, index) => `context${index}`).join(" ");
    for (let index = 0; index < 300; index++) {
      registerDiscoveryTool(registry, `tool${index}.inspect`, context);
    }
    registerDiscoveryTool(registry, "network.scan", "Discover reachable network hosts");
    const started = performance.now();
    const matches = registry.search(`scan network ${context} scan network`, { limit: 10 });
    __jait_capture(0, (matches));
    // A generous budget catches the multi-minute freeze without relying on
    // small timing differences between CI machines.
    __jait_capture(1, (performance.now() - started));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_295_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "network.scan", "Discover network hosts");
    registerDiscoveryTool(registry, "preview.open", "Open an application preview");
    const context = Array.from({ length: 8000 }, (_, index) => `context${index}`).join(" ");
    const names = registry.search(`scan network ${context} open preview`).map(tool => tool.name);
    __jait_capture(0, (names));
    __jait_capture(1, (names));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_305_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "preview.open", "Open the application preview");
    __jait_capture(0, (registry.search(`${"x".repeat(500000)} prevew`)[0]?.name));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_311_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = new ToolRegistry();
    registerDiscoveryTool(registry, "file.read", "Read files");
    registerDiscoveryTool(registry, "file.list", "List files");
    const rank = vi.spyOn(registry, "rankSearch");
    const fetcher = vi.fn().mockResolvedValue(new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    try {
      const matches = await registry.rankSearchWithSystemOne("files", { limit: 1 }, { JEV_API_KEY: "bounded-search-regression" });
      __jait_capture(0, (rank.mock.calls));
      __jait_capture(1, (matches));
      __jait_capture(2, (fetcher.mock.calls));
    } finally {
      vi.unstubAllGlobals();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_331_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const registry = createToolRegistry(new SurfaceRegistry(), { userQuestionService: {}, previewService: {} } as any);
    __jait_captureType(0, (registry.get("browser.handoff")));
    for (const [legacy, canonical] of [["preview.open", "browser.open"], ["preview.stop", "browser.close"], ["preview.restart", "browser.restart"], ["preview.status", "browser.status"], ["preview.logs", "browser.logs"]]) {
      __jait_captureType(1, (registry.get(canonical)));
      __jait_captureType(2, (registry.get(legacy)));
      __jait_capture(3, (registry.get(canonical)?.description));
    }
    __jait_captureType(4, (registry.get("preview.inspect")));
    __jait_captureType(5, (createToolRegistry(new SurfaceRegistry(), { userQuestionService: {} } as any).get("browser.handoff")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_tools_registry_test_ts_345_3": {


function context() {
  return {
    sessionId: "s-registry",
    actionId: "a-registry",
    projectRoot: process.cwd(),
    requestedBy: "test",
  };
}
function registerDiscoveryTool(
  registry: ToolRegistry,
  name: string,
  description: string,
  options: { tier?: "core" | "standard" | "external"; source?: "builtin" | "mcp" | `plugin:${string}`; priority?: number } = {},
): void {
  registry.register({
    name,
    description,
    tier: options.tier ?? "standard",
    category: options.source === "mcp" ? "external" : "meta",
    source: options.source ?? "builtin",
    discovery: options.priority == null ? undefined : { priority: options.priority },
    parameters: { type: "object", properties: {} },
    execute: async () => ({ ok: true, message: "completed" }),
  });
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const service = { list: vi.fn(() => []), get: vi.fn(() => null), publicBaseUrl: () => "https://jait.invalid", webhookSecret: () => undefined };
    const threads = { getById: vi.fn(() => ({ userId: "owner", personaAgentId: "persona" })), getPersonaAgent: vi.fn(() => ({ id: "persona" })) };
    const registry = createToolRegistry(new SurfaceRegistry(), { agentGithubAppService: service, threadService: threads } as any);
    const tool = registry.get("agent.github")!;
    const own = await tool.execute({ action: "status" }, { ...context(), userId: "owner", threadId: "thread" });
    __jait_capture(0, (own.data));
    __jait_capture(1, (service.get.mock.calls));
    service.get.mockClear();
    const other = await tool.execute({ action: "status" }, { ...context(), userId: "other", threadId: "thread" });
    __jait_capture(2, (other.data));
    __jait_capture(3, (service.get.mock.calls));
    const chat = await tool.execute({ action: "status" }, { ...context(), userId: "owner" });
    __jait_capture(4, (chat.data));
    threads.getPersonaAgent.mockReturnValueOnce(null as any);
    const deleted = await tool.execute({ action: "status" }, { ...context(), userId: "owner", threadId: "thread" });
    __jait_capture(5, (deleted.data));
  
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
