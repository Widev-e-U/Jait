// Translated fixture from packages/gateway/src/server.test.ts; expected literals are in tail_static.rs.
import { createServer } from "../../../../packages/gateway/src/server.js";
import { loadConfig } from "../../../../packages/gateway/src/config.js";
import { signAuthToken } from "../../../../packages/gateway/src/security/http-auth.js";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer as createHttpServer } from "node:http";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, unlinkSync } from "node:fs";
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/server.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_server_test_ts_40_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{

try {
await (async()=>{

    const webDir = mkdtempSync(join("/tmp", "jait-web-cache-"));
    const assetDir = join(webDir, "assets");
    const assetName = "app-B1234567.js";
    const assetPath = join(assetDir, assetName);
    mkdirSync(assetDir);
    writeFileSync(join(webDir, "index.html"), "<!doctype html><title>test</title>");
    writeFileSync(assetPath, "export const cached = true;");
    const previous = process.env["JAIT_WEB_DIR"];
    process.env["JAIT_WEB_DIR"] = webDir;
    let app: Awaited<ReturnType<typeof createServer>> | undefined;
    try {
      app = await createServer({ ...testConfig, nodeEnv: "production" });
      const first = await app.inject({ method: "GET", url: `/assets/${assetName}` });
      __jait_capture(0, (first.statusCode));
      __jait_capture(1, (first.body));
      __jait_capture(2, (first.headers["cache-control"]));
      const range = await app.inject({
        method: "GET",
        url: `/assets/${assetName}`,
        headers: { range: "bytes=0-5" },
      });
      __jait_capture(3, (range.statusCode));
      __jait_capture(4, (range.body));
      unlinkSync(assetPath);
      const second = await app.inject({ method: "GET", url: `/assets/${assetName}` });
      __jait_capture(5, (second.statusCode));
      __jait_capture(6, (second.body), (first.body));
    } finally {
      await app?.close();
      if (previous === undefined) delete process.env["JAIT_WEB_DIR"];
      else process.env["JAIT_WEB_DIR"] = previous;
      rmSync(webDir, { recursive: true, force: true });
    }
  
})();

} finally {

}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_78_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/health",
    });

    __jait_capture(0, (response.statusCode));
    const body = JSON.parse(response.body);
    __jait_capture(1, (body.healthy));
    __jait_capture(2, (body.version));
    __jait_capture(3, (typeof body.uptime));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_93_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const app = await createServer(testConfig);
    const response = await app.inject({
      method: "GET",
      url: "/",
    });

    __jait_capture(0, (response.statusCode));
    const contentType = response.headers["content-type"] ?? "";
    if (String(contentType).includes("text/html")) {
      // Web dist is present — SPA is served
      __jait_capture(1, (response.body));
    } else {
      // No web dist — JSON fallback
      const body = JSON.parse(response.body);
      __jait_capture(2, (body.name));
      __jait_capture(3, (body.status));
      __jait_capture(4, (body.version));
    }
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_115_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: { content: "", sessionId: "test" },
    });

    __jait_capture(0, (response.statusCode));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_128_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      headers,
      payload: {},
    });

    __jait_capture(0, (response.statusCode));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_141_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const { app, headers } = await createAuthedServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/sessions/unknown-session/messages",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    const body = JSON.parse(response.body);
    __jait_capture(1, (body.sessionId));
    __jait_capture(2, (body.messages));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_173_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const { app, headers } = await createRegisteredPreviewServer();
    // Encode relative path from cwd — avoids platform-specific absolute path issues
    const relPath = relative(process.cwd(), devFileHtml);
    const encodedPath = Buffer.from(relPath, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const response = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}`,
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (String(response.headers["content-type"])));
    __jait_capture(2, (response.body), (`<base href="/api/dev-file/${encodedPath}/">`));
    __jait_capture(3, (response.body), (`/api/dev-file/${encodedPath}/icon.svg`));

    const assetResponse = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}/icon.svg`,
      headers,
    });

    __jait_capture(4, (assetResponse.statusCode));
    __jait_capture(5, (String(assetResponse.headers["content-type"])));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_205_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const { app, headers } = await createRegisteredPreviewServer();
    const relPath = relative(process.cwd(), devFileHtml);
    const encodedPath = Buffer.from(relPath, "utf8")
      .toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/g, "");

    const response = await app.inject({
      method: "GET",
      url: `/api/dev-file/${encodedPath}`,
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (String(response.headers["content-type"])));
    await app.close();
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_225_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const upstream = createHttpServer((request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end('<!DOCTYPE html><html><head></head><body><script type="module" src="/@vite/client"></script><script type="module" src="/src/main.tsx"></script></body></html>');
        return;
      }

      if (request.url === "/src/main.tsx") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end('import "/@fs/home/user/project/node_modules/vite/dist/client/env.mjs"; import "/node_modules/.vite/deps/react.js?v=1";');
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const { app, headers } = await createRegisteredPreviewServer(address.port);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (String(response.headers["content-type"])));
    __jait_capture(2, (response.body), (`"/api/dev-proxy/${address.port}/@fs/home/user/project/node_modules/vite/dist/client/env.mjs"`));
    __jait_capture(3, (response.body), (`"/api/dev-proxy/${address.port}/node_modules/.vite/deps/react.js?v=1"`));

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/`,
      headers,
    });

    __jait_capture(4, (htmlResponse.statusCode));
    __jait_capture(5, (htmlResponse.body));
    __jait_capture(6, (htmlResponse.body), (`/api/dev-proxy/${address.port}/src/main.tsx`));

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_275_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    let attempts = 0;
    const upstream = createHttpServer((request, response) => {
      if (request.url?.startsWith("/node_modules/.vite/deps/react.js")) {
        attempts += 1;
        if (attempts === 1) {
          response.writeHead(504, { "Content-Type": "text/plain; charset=utf-8" });
          response.end("Outdated Optimize Dep");
          return;
        }
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end("export default 'ok';");
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const { app, headers } = await createRegisteredPreviewServer(address.port);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/node_modules/.vite/deps/react.js?v=1`,
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.body));
    __jait_capture(2, (attempts));

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_315_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const upstream = createHttpServer((request, response) => {
      if (request.url === "/") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end('<!DOCTYPE html><html><body><script type="module" src="/src/main.tsx"></script></body></html>');
        return;
      }

      if (request.url === "/src/main.tsx") {
        response.writeHead(200, { "Content-Type": "text/javascript; charset=utf-8" });
        response.end('import "/@vite/client"; console.log("ok");');
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const { app, headers } = await createRegisteredPreviewServer(address.port);

    const htmlResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/`,
      headers,
    });

    __jait_capture(0, (htmlResponse.statusCode));
    __jait_capture(1, (htmlResponse.body), (`/api/dev-proxy/${address.port}/src/main.tsx`));

    const moduleResponse = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
      headers,
    });

    __jait_capture(2, (moduleResponse.statusCode));
    __jait_capture(3, (moduleResponse.body), (`/api/dev-proxy/${address.port}/@vite/client`));

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
case "tailstatic_packages_gateway_src_server_test_ts_363_3": {


const __jait_original_dir = dirname(fileURLToPath(__jait_original_url));
const testConfig = {
  ...loadConfig(),
  port: 0, // random port
  wsPort: 0,
  logLevel: "silent",
  nodeEnv: "development",
};
async function createAuthedServer() {
  const app = await createServer(testConfig);
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  const headers = { authorization: `Bearer ${token}` };
  return { app, headers };
}
async function createRegisteredPreviewServer(port = 4321) {
  const app = await createServer(testConfig, {
    projectService: { list: () => [{ rootPath: process.cwd() }] } as any,
    sessionService: { getById: (_id: string, userId: string) => userId === "test-user" ? { userId } : null } as any,
    previewService: { list: () => [{ sessionId: "preview", status: "ready", port }] } as any,
  });
  const token = await signAuthToken({ id: "test-user", username: "tester" }, testConfig.jwtSecret);
  return { app, headers: { authorization: "Bearer " + token } };
}
/*__jait_scope_open__*/{
let devFileFixtureDir: string;
let devFileHtml: string;
let devFileSvg: string;
const __jait_hook_5698 = () => {
    devFileFixtureDir = mkdtempSync(join(process.cwd(), ".tmp-dev-file-test-"));
    devFileHtml = join(devFileFixtureDir, "preview.html");
    devFileSvg = join(devFileFixtureDir, "icon.svg");
    writeFileSync(devFileHtml, '<!DOCTYPE html>\n<html><head><title>Test</title></head>\n<body><img src="/icon.svg" /></body>\n</html>\n');
    writeFileSync(devFileSvg, '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>\n');
  };
const __jait_hook_6188 = () => {
    rmSync(devFileFixtureDir, { recursive: true, force: true });
  };
await __jait_hook_5698();
try {
await (async()=>{

    const upstream = createHttpServer((request, response) => {
      if (request.url?.startsWith("/src/main.tsx")) {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
        response.end("<!DOCTYPE html><html><body>spa fallback</body></html>");
        return;
      }

      response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      response.end("not found");
    });

    await new Promise<void>((resolveListen) => upstream.listen(0, "127.0.0.1", () => resolveListen()));
    const address = upstream.address();
    if (!address || typeof address === "string") {
      throw new Error("Expected TCP address for upstream test server");
    }

    const { app, headers } = await createRegisteredPreviewServer(address.port);
    const response = await app.inject({
      method: "GET",
      url: `/api/dev-proxy/${address.port}/src/main.tsx`,
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (String(response.headers["content-type"])));
    __jait_capture(2, (response.json()));

    await app.close();
    await new Promise<void>((resolveClose, rejectClose) => upstream.close((error) => error ? rejectClose(error) : resolveClose()));
  
})();

} finally {
await __jait_hook_6188();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
