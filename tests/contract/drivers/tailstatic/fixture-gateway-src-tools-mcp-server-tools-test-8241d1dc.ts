// Translated fixture from packages/gateway/src/tools/mcp-server-tools.test.ts; expected literals are in tail_static.rs.
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";


import type { ToolContext } from "../../../../packages/gateway/src/tools/contracts.js";
import { McpManager } from "../../../../packages/gateway/src/tools/mcp-bridge.js";
import { createMcpAddServerTool, loadMcpServerConfigs } from "../../../../packages/gateway/src/tools/mcp-server-tools.js";
import { ToolRegistry } from "../../../../packages/gateway/src/tools/registry.js";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/tools/mcp-server-tools.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_tools_mcp_server_tools_test_ts_46_3": {

const { McpServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/mcp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/mcp.js")));
const { StreamableHTTPServerTransport } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/streamableHttp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/streamableHttp.js")));
const ctx = {} as ToolContext;
const TOKEN = "test-token-abc123";
let http: Server;
let url: string;
let dir: string;
const __jait_hook_821 = async () => {
  dir = await mkdtemp(join(__jait_fixture_dir, "jait-mcp-"));
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const server = new McpServer({ name: "fake", version: "1.0.0" });
    server.tool("ping", "Ping the fake server", async () => ({ content: [{ type: "text", text: "pong" }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
};
const __jait_hook_1618 = async () => {
  http.closeAllConnections();
  await new Promise((r) => http.close(r));
  await rm(dir, { recursive: true, force: true });
};
/*__jait_scope_open__*/{
await __jait_hook_821();
try {
await (async()=>{

    const registry = new ToolRegistry();
    const manager = new McpManager(registry);
    const configPath = join(dir, "mcp-servers.json");
    const tool = createMcpAddServerTool({ manager, configPath });

    const res = await tool.execute(
      { name: "FakeGym", transport: "http", url, headers: { Authorization: `Bearer ${TOKEN}` } },
      ctx,
    );
    __jait_capture(0, (res.ok));
    __jait_capture(1, (registry.listNames()));
    __jait_capture(2, (JSON.stringify(res)), (TOKEN));

    const saved = await loadMcpServerConfigs(configPath);
    __jait_capture(3, (saved));
    __jait_capture(4, (saved[0]?.headers?.Authorization), (`Bearer ${TOKEN}`));
    __jait_capture(5, ((await stat(configPath)).mode & 0o777));

    // Re-adding replaces rather than duplicates.
    await tool.execute({ name: "fakegym", transport: "http", url, headers: ["Authorization: Bearer " + TOKEN] }, ctx);
    __jait_capture(6, (await loadMcpServerConfigs(configPath)));
    manager.removeServer("fakegym");
  
})();

} finally {
await __jait_hook_1618();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_mcp_server_tools_test_ts_71_3": {

const { McpServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/mcp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/mcp.js")));
const { StreamableHTTPServerTransport } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/streamableHttp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/streamableHttp.js")));
const ctx = {} as ToolContext;
const TOKEN = "test-token-abc123";
let http: Server;
let url: string;
let dir: string;
const __jait_hook_821 = async () => {
  dir = await mkdtemp(join(__jait_fixture_dir, "jait-mcp-"));
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const server = new McpServer({ name: "fake", version: "1.0.0" });
    server.tool("ping", "Ping the fake server", async () => ({ content: [{ type: "text", text: "pong" }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
};
const __jait_hook_1618 = async () => {
  http.closeAllConnections();
  await new Promise((r) => http.close(r));
  await rm(dir, { recursive: true, force: true });
};
/*__jait_scope_open__*/{
await __jait_hook_821();
try {
await (async()=>{

    const manager = new McpManager(new ToolRegistry());
    const configPath = join(dir, "mcp-servers.json");
    const tool = createMcpAddServerTool({ manager, configPath });
    const res = await tool.execute(
      { name: "bad", transport: "http", url, headers: { Authorization: "Bearer wrong-token-999" } },
      ctx,
    );
    __jait_capture(0, (res.ok));
    __jait_capture(1, (JSON.stringify(res)));
    __jait_capture(2, (await readFile(configPath, "utf8")));
  
})();

} finally {
await __jait_hook_1618();
}
}

break;
}
case "tailstatic_packages_gateway_src_tools_mcp_server_tools_test_ts_84_3": {

const { McpServer } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/mcp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/mcp.js")));
const { StreamableHTTPServerTransport } = await import((typeof Bun!=="undefined"?Bun.resolveSync("@modelcontextprotocol/sdk/server/streamableHttp.js", __jait_original_dir):__jait_require.resolve("@modelcontextprotocol/sdk/server/streamableHttp.js")));
const ctx = {} as ToolContext;
const TOKEN = "test-token-abc123";
let http: Server;
let url: string;
let dir: string;
const __jait_hook_821 = async () => {
  dir = await mkdtemp(join(__jait_fixture_dir, "jait-mcp-"));
  http = createServer(async (req, res) => {
    if (req.headers.authorization !== `Bearer ${TOKEN}`) {
      res.writeHead(401).end("unauthorized");
      return;
    }
    const server = new McpServer({ name: "fake", version: "1.0.0" });
    server.tool("ping", "Ping the fake server", async () => ({ content: [{ type: "text", text: "pong" }] }));
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => void server.close());
    await server.connect(transport);
    await transport.handleRequest(req, res);
  });
  await new Promise<void>((r) => http.listen(0, "127.0.0.1", r));
  url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/mcp`;
};
const __jait_hook_1618 = async () => {
  http.closeAllConnections();
  await new Promise((r) => http.close(r));
  await rm(dir, { recursive: true, force: true });
};
/*__jait_scope_open__*/{
await __jait_hook_821();
try {
await (async()=>{

    const tool = createMcpAddServerTool({ manager: new McpManager(new ToolRegistry()), configPath: join(dir, "c.json") });
    __jait_capture(0, ((await tool.execute({ name: "x", transport: "http" }, ctx)).ok));
    __jait_capture(1, ((await tool.execute({ name: "x", transport: "http", url: "ftp://a" }, ctx)).ok));
    __jait_capture(2, ((await tool.execute({ name: "x", transport: "stdio" }, ctx)).ok));
    __jait_capture(3, ((await tool.execute({ name: "!!!", transport: "stdio", command: "x" }, ctx)).ok));
    __jait_capture(4, ((await tool.execute({ name: "x", transport: "http", url, headers: { "Bad Name": "v" } }, ctx)).ok));
  
})();

} finally {
await __jait_hook_1618();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
