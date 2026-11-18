// Translated fixture from packages/gateway/src/providers/pi-mcp-provision.test.ts; expected literals are in tail_static.rs.
import { existsSync, readFileSync, mkdirSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { isPiBasedProvider, provisionPiMcp } from "../../../../packages/gateway/src/providers/pi-mcp-provision.js";
import { JAIT_CORE_MCP_SERVER_NAME, JAIT_DEFERRED_MCP_SERVER_NAME } from "../../../../packages/gateway/src/providers/jait-mcp.js";
import type { McpServerRef } from "../../../../packages/gateway/src/providers/contracts.js";
import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/providers/pi-mcp-provision.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_15_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (provisionPiMcp("codex", httpRefs, { sessionId: "s1" })));
    __jait_captureType(1, (provisionPiMcp("claude-code", httpRefs, { sessionId: "s1" })));
    __jait_captureType(2, (provisionPiMcp("cursor", httpRefs, { sessionId: "s1" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_21_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_captureType(0, (provisionPiMcp("pi", undefined, { sessionId: "s1" })));
    __jait_captureType(1, (provisionPiMcp("pi", [], { sessionId: "s1" })));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_26_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    __jait_capture(0, (isPiBasedProvider("pi")));
    __jait_capture(1, (isPiBasedProvider("pi-gemini")));
    __jait_capture(2, (isPiBasedProvider("codex")));
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_32_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const result = provisionPiMcp("pi", httpRefs, { sessionId: "s1", realPiCommand: "/usr/local/bin/pi" });
    __jait_captureType(0, (result));
    const provision = result!;
    try {
      const wrapperPath = provision.env["PI_ACP_PI_COMMAND"];
      __jait_captureType(1, (wrapperPath));
      __jait_capture(2, (join(wrapperPath)));
      __jait_capture(3, (existsSync(wrapperPath)));

      const configPath = join(dirname(wrapperPath), "mcp.json");
      const config = JSON.parse(readFileSync(configPath, "utf8"));
      __jait_capture(4, (config.mcpServers[JAIT_CORE_MCP_SERVER_NAME]), ({
        url: httpRefs[0].url,
        lifecycle: "lazy",
      }));
      __jait_capture(5, (config.mcpServers[JAIT_DEFERRED_MCP_SERVER_NAME]), ({
        url: httpRefs[1].url,
        lifecycle: "lazy",
      }));

      const wrapper = readFileSync(wrapperPath, "utf8");
      __jait_capture(6, (wrapper), (`exec "/usr/local/bin/pi" --mcp-config "${configPath}"`));
      __jait_capture(7, (wrapper));
    } finally {
      provision.cleanup();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_61_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provision = provisionPiMcp("pi-gemini", httpRefs, { sessionId: "s2" })!;
    try {
      const wrapper = readFileSync(provision.env["PI_ACP_PI_COMMAND"], "utf8");
      __jait_capture(0, (wrapper));
    } finally {
      provision.cleanup();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_71_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const stdioRefs: McpServerRef[] = [
      { name: "local", transport: "stdio", command: "node", args: ["server.js"], env: { FOO: "bar" } },
    ];
    const provision = provisionPiMcp("pi", stdioRefs, { sessionId: "s3" })!;
    try {
      const config = JSON.parse(readFileSync(join(dirname(provision.env["PI_ACP_PI_COMMAND"]), "mcp.json"), "utf8"));
      __jait_capture(0, (config.mcpServers["local"]));
    } finally {
      provision.cleanup();
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_84_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const provision = provisionPiMcp("pi", httpRefs, { sessionId: "s4" })!;
    const wrapperPath = provision.env["PI_ACP_PI_COMMAND"];
    const dir = dirname(wrapperPath);
    __jait_capture(0, (existsSync(dir)));
    provision.cleanup();
    __jait_capture(1, (existsSync(dir)));
    // idempotent
    provision.cleanup();
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_103_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{
/*__jait_source_gate__ skipIf process.platform === "win32" */

try {
await (async()=>{

    mkdirSync(reproRoot, { recursive: true });
    const fixture = mkdtempSync(join(reproRoot, 'paths "$JAIT_PI_MARKER"-'));
    const realPi = join(fixture, 'pi "$JAIT_PI_MARKER"');
    writeFileSync(realPi, "#!/usr/bin/env node\nprocess.stdout.write(JSON.stringify(process.argv.slice(2)));\n", { mode: 0o755 });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = fixture;
    const provision = provisionPiMcp("pi", httpRefs, { sessionId: "literal", realPiCommand: realPi })!;
    try {
      const args = ["literal $arg", "two words", "; &"];
      const child = spawnSync(provision.env.PI_ACP_PI_COMMAND!, args, { encoding: "utf8", env: { ...process.env, JAIT_PI_MARKER: "expanded" } });
      __jait_capture(0, (child.status));
      __jait_capture(1, (JSON.parse(child.stdout)), (["--mcp-config", join(dirname(provision.env.PI_ACP_PI_COMMAND!), "mcp.json"), ...args]));
    } finally {
      provision.cleanup(); restoreTmpdir(previous); rmSync(fixture, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_121_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    mkdirSync(reproRoot, { recursive: true });
    const fixture = mkdtempSync(join(reproRoot, "root-error-"));
    const blocked = join(fixture, "not-a-directory");
    writeFileSync(blocked, "fixture");
    const previous = process.env.TMPDIR; process.env.TMPDIR = blocked;
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      let result: ReturnType<typeof provisionPiMcp> | undefined;
      __jait_thrown(0, () => { result = provisionPiMcp("pi", httpRefs, { sessionId: "root-error" }); });
      __jait_captureType(1, (result)); __jait_capture(2, (warning.mock.calls));
    } finally { restoreTmpdir(previous); warning.mockRestore(); rmSync(fixture, { recursive: true, force: true }); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_135_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const refs: McpServerRef[] = [{ name: "__proto__", transport: "http", url: "http://example.test/mcp" }];
    const provision = provisionPiMcp("pi", refs, { sessionId: "prototype" })!;
    try {
      const config = JSON.parse(readFileSync(join(dirname(provision.env.PI_ACP_PI_COMMAND!), "mcp.json"), "utf8"));
      __jait_capture(0, (Object.hasOwn(config.mcpServers, "__proto__")));
      __jait_capture(1, (config.mcpServers.__proto__));
    } finally { provision.cleanup(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_145_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    // Session ids become directory names; a path separator must never let a
    // provisioned config land outside the temp root. Provisioning is
    // best-effort, so the session starts without Jait tools instead of failing.
    const warning = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      __jait_captureType(0, (provisionPiMcp("pi", httpRefs, { sessionId: "../escape" })));
      __jait_capture(1, (warning.mock.calls));
      __jait_capture(2, (String(warning.mock.calls[0]?.[0])));
    } finally { warning.mockRestore(); }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_providers_pi_mcp_provision_test_ts_160_3": {


const httpRefs: McpServerRef[] = [
  { name: JAIT_CORE_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=core" },
  { name: JAIT_DEFERRED_MCP_SERVER_NAME, transport: "http", url: "http://127.0.0.1:8765/mcp?sessionId=s1&toolSet=deferred" },
];
const reproRoot = resolve(__jait_original_dir, "../../../../.jait/artifacts/gateway-rust/pi-provision-repro");
function restoreTmpdir(previous: string | undefined) {
  if (previous === undefined) delete process.env.TMPDIR;
  else process.env.TMPDIR = previous;
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    mkdirSync(reproRoot, { recursive: true });
    const previous = process.env.TMPDIR;
    process.env.TMPDIR = reproRoot;
    const provision = provisionPiMcp("pi", [{ name: "minimal", transport: "stdio", command: "node" }],
      { sessionId: "minimal-stdio", realPiCommand: "  " })!;
    __jait_captureType(0, (provision));
    try {
      const wrapper = provision.env.PI_ACP_PI_COMMAND!;
      const config = JSON.parse(readFileSync(join(dirname(wrapper), "mcp.json"), "utf8"));
      __jait_capture(1, (config.mcpServers.minimal));
      __jait_capture(2, (config.mcpServers.minimal));
      __jait_capture(3, (readFileSync(wrapper, "utf8")));
    } finally { provision.cleanup(); restoreTmpdir(previous); }
  
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
