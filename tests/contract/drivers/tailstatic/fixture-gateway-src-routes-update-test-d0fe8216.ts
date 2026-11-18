// Translated fixture from packages/gateway/src/routes/update.test.ts; expected literals are in tail_static.rs.




import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/routes/update.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_routes_update_test_ts_43_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubEnv("INVOCATION_ID", "test-service");
    vi.stubEnv("JAIT_UNIT", "custom-jait");
    let finish!: (value: { newVersion: string }) => void;
    updateMocks.prepare.mockImplementation(() => new Promise((done) => { finish = done; }));
    updateMocks.launch.mockResolvedValue(undefined);
    const { app, headers } = await createUpdateServer();
    const pending = app.inject({ method: "POST", url: "/api/update/apply", headers, payload: { version: "0.1.999" } }).then((result) => result);
    await vi.waitFor(() => __jait_captureType(0, (finish)));
    const other = await app.inject({ method: "GET", url: "/does-not-exist" });
    __jait_capture(1, (other.statusCode));
    finish({ newVersion: "0.1.999" });
    __jait_capture(2, ((await pending).json()));
    __jait_capture(3, (updateMocks.launch.mock.calls));
    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_60_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubEnv("INVOCATION_ID", "test-service");
    const plan = { newVersion: "0.1.999" };
    updateMocks.prepare.mockResolvedValue(plan);
    updateMocks.launch.mockRejectedValue(new Error("systemd-run failed"));
    const { app, headers } = await createUpdateServer();
    const result = await app.inject({ method: "POST", url: "/api/update/apply", headers });
    __jait_capture(0, (result.statusCode));
    __jait_capture(1, (updateMocks.discard.mock.calls), ([plan]));
    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_74_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { tag_name: "v0.1.666", name: "Jait v0.1.666", published_at: "2026-08-04T10:50:04Z", html_url: "https://github.com/Widev-e-U/Jait/releases/tag/v0.1.666" },
        { tag_name: "v0.1.665", name: "Jait v0.1.665", published_at: "2026-08-04T08:31:40Z", html_url: "https://github.com/Widev-e-U/Jait/releases/tag/v0.1.665" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        commits: [{ sha: "abc123", commit: { message: "feat: swarm sub-agent cards", author: { date: "2026-08-04T09:00:00Z" } } }],
      }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/update/changelog?from=0.1.665",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_105_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([
      { tag_name: "v0.1.666", name: "Jait v0.1.666", published_at: "2026-08-04T10:50:04Z", html_url: "" },
    ]), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/update/changelog?from=0.1.666",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json().releases));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_123_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { tag_name: "v0.1.666", name: "Jait v0.1.666", published_at: "2026-08-04T10:50:04Z", html_url: "https://github.com/Widev-e-U/Jait/releases/tag/v0.1.666" },
        { tag_name: "v0.1.665", name: "Jait v0.1.665", published_at: "2026-08-04T08:31:40Z", html_url: "https://github.com/Widev-e-U/Jait/releases/tag/v0.1.665" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        commits: [{ sha: "def456", commit: { message: "fix: refine chat loading skeleton", author: { date: "2026-08-04T09:00:00Z" } } }],
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        commits: [{ sha: "abc123", commit: { message: "feat: swarm sub-agent cards", author: { date: "2026-08-04T09:00:00Z" } } }],
      }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/update/changelog?from=0.1.666&limit=5",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    const body = response.json();
    __jait_capture(1, (body.releases.map((r: { version: string }) => r.version)));
    __jait_capture(2, (body.releases[0].commits[0].message));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_151_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        { tag_name: "v0.1.666", name: "Jait v0.1.666", published_at: "", html_url: "" },
        { tag_name: "v0.1.665", name: "Jait v0.1.665", published_at: "", html_url: "" },
      ]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ commits: [] }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/update/changelog?from=0.1.665&to=0.1.666",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    const body = response.json();
    __jait_capture(1, (body.releases));
    __jait_capture(2, (body.releases[0].version));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_174_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/update/changelog?from=0.1.665",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_195_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [
        {
          name: "app-release-unsigned.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/app-release-unsigned.apk",
        },
        {
          name: "Jait-0.1.635-android.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-android.apk",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));
    __jait_capture(2, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_233_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [
        {
          name: "Jait-0.1.635-android.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-android.apk",
        },
        {
          name: "Jait-0.1.635-wear.apk",
          browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/Jait-0.1.635-wear.apk",
        },
      ],
    }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_265_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.634",
      assets: [{
        name: "Jait-0.1.634-android.apk",
        browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.634/Jait-0.1.634-android.apk",
      }],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json().hasUpdate));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_287_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [{
        name: "app-release-unsigned.apk",
        browser_download_url: "https://github.com/Widev-e-U/Jait/releases/download/v0.1.635/app-release-unsigned.apk",
      }],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_313_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({
      tag_name: "v0.1.635",
      assets: [],
    }), { status: 200 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_337_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 403 })));

    const { app, headers } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
      headers,
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (response.json()));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_356_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { app } = await createUpdateServer();
    const response = await app.inject({
      method: "GET",
      url: "/api/mobile-update/check?currentVersion=0.1.634",
    });

    __jait_capture(0, (response.statusCode));
    __jait_capture(1, (fetchMock.mock.calls));

    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_375_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    let finish!: (error: Error | null, stdout: string) => void;
    updateMocks.exec.mockImplementation((_cmd, _options, callback) => { finish = callback; });
    const { app, headers } = await createUpdateServer();
    const first = app.inject({ method: "GET", url: "/api/update/check", headers }).then((r) => r);
    const second = app.inject({ method: "GET", url: "/api/update/check", headers }).then((r) => r);
    await vi.waitFor(() => __jait_captureType(0, (finish)));
    __jait_capture(1, ((await app.inject("/does-not-exist")).statusCode));
    __jait_capture(2, (updateMocks.exec.mock.calls));
    __jait_capture(3, (updateMocks.exec.mock.calls));
    finish(null, "99.0.0\n");
    for (const result of await Promise.all([first, second])) {
      __jait_capture(4, (result.statusCode));
      __jait_capture(5, (result.json()));
    }
    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
case "tailstatic_packages_gateway_src_routes_update_test_ts_395_3": {
const updateMocks = vi.hoisted(() => ({ prepare: vi.fn(), launch: vi.fn(), discard: vi.fn(), exec: vi.fn() }));
await vi.mock("node:child_process", () => ({ exec: updateMocks.exec }));
await vi.mock(__jait_fileURLToPath(new URL("../../../../packages/gateway/bin/safe-update.mjs",import.meta.url)), () => ({
  prepareUpdate: updateMocks.prepare,
  launchSystemdUpdate: updateMocks.launch,
  discardUpdate: updateMocks.discard,
}));
const { default: Fastify } = await import((typeof Bun!=="undefined"?Bun.resolveSync("fastify", __jait_original_dir):__jait_require.resolve("fastify")));
const { loadConfig } = await import("../../../../packages/gateway/src/config.js");
const { signAuthToken } = await import("../../../../packages/gateway/src/security/http-auth.js");
const { registerUpdateRoutes, __resetUpdateCaches } = await import("../../../../packages/gateway/src/routes/update.js");
async function createUpdateServer() {
  const config = { ...loadConfig(), port: 0, wsPort: 0, logLevel: "silent", nodeEnv: "test" };
  const app = Fastify({ logger: false });
  registerUpdateRoutes(app, config, {
    shutdown: async () => undefined,
    port: 0,
  });
  await app.ready();

  const token = await signAuthToken(
    { id: "android-owner", username: "alice" },
    config.jwtSecret,
  );

  return {
    app,
    headers: { Authorization: `Bearer ${token}` },
  };
}
const __jait_hook_1101 = () => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  __resetUpdateCaches();
};
/*__jait_scope_open__*/{

try {
await (async()=>{

    updateMocks.exec.mockImplementationOnce((_cmd, _options, callback) => callback(new Error("timed out"), ""));
    updateMocks.exec.mockImplementationOnce((_cmd, _options, callback) => callback(null, "99.0.0"));
    const { app, headers } = await createUpdateServer();
    const failed = await app.inject({ method: "GET", url: "/api/update/check", headers });
    __jait_capture(0, (failed.statusCode));
    __jait_capture(1, (failed.json()));
    __jait_capture(2, ((await app.inject({ method: "GET", url: "/api/update/check", headers })).statusCode));
    __jait_capture(3, (updateMocks.exec.mock.calls));
    await app.close();
  
})();

} finally {
await __jait_hook_1101();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
