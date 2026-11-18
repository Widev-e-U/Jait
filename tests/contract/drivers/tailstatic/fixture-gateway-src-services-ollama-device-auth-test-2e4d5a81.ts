// Translated fixture from packages/gateway/src/services/ollama-device-auth.test.ts; expected literals are in tail_static.rs.



import { vi } from '../tailmock.ts';
import { createRequire as __jait_createRequire } from 'node:module';
import { observe as __jait_observe } from '../tailtransport.ts';
import { mkdir as __jait_mkdir } from 'node:fs/promises';
import { fileURLToPath as __jait_fileURLToPath } from 'node:url';
const __jait_original_url=new URL("../../../../packages/gateway/src/services/ollama-device-auth.test.ts",import.meta.url).href;
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
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_34_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    const key = parseOllamaDeviceKey(fixture());
    __jait_capture(0, (createPublicKey(key).export({ format: "jwk" })), (publicKey.export({ format: "jwk" })));
    const [pub, signature] = signOllamaRequest(key, "GET", "/api/usage", "123").split(":");
    __jait_capture(1, (Buffer.from(pub, "base64").subarray(4, 15).toString()));
    __jait_capture(2, (verify(null, Buffer.from("GET,/api/usage?ts=123"), publicKey, Buffer.from(signature, "base64"))));
    __jait_capture(3, (verify(null, Buffer.from("GET,/api/me?ts=123"), publicKey, Buffer.from(signature, "base64"))));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_43_3_each0": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const pem = "invalid";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_thrown(0, () => parseOllamaDeviceKey(pem));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_43_3_each1": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const pem = fixture("aes256-ctr");
await __jait_hook_1792();
try {
await (async()=>{

    __jait_thrown(0, () => parseOllamaDeviceKey(pem));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_43_3_each2": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const pem = fixture().slice(0, 100);
await __jait_hook_1792();
try {
await (async()=>{

    __jait_thrown(0, () => parseOllamaDeviceKey(pem));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_47_3_each0": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://localhost:11434";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_47_3_each1": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://127.0.0.1:11434/";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_47_3_each2": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://[::1]:11434";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each0": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://192.168.1.2:11434";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each1": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "https://ollama.com";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each2": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://localhost.evil.test";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://localhost/proxy";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each4": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://user@localhost";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each5": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "http://localhost?target=remote";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each6": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "file:///";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_50_3_each7": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const url = "invalid";
await __jait_hook_1792();
try {
await (async()=>{

    __jait_capture(0, (isLocalOllamaUrl(url)));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_62_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("missing", { status: 404 })));
    await __jait_captureRejected(0, (fetchSignedInOllamaUsage("http://remote:11434", account)));
    __jait_capture(1, (readFile.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_68_3_each0": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const body = { Email: "someone@example.com", Name: account.name };
await __jait_hook_1792();
try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    await __jait_rejected(0, fetchOllamaDeviceUsage(account, privateKey));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_68_3_each1": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const body = {};
await __jait_hook_1792();
try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    await __jait_rejected(0, fetchOllamaDeviceUsage(account, privateKey));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_68_3_each2": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
/*__jait_scope_open__*/{
const body = null;
await __jait_hook_1792();
try {
await (async()=>{

    const fetchMock = vi.fn().mockResolvedValue(json(body));
    vi.stubGlobal("fetch", fetchMock);
    await __jait_rejected(0, fetchOllamaDeviceUsage(account, privateKey));
    __jait_capture(1, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_75_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(account)).mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(json(usage)));
    await __jait_captureResolved(0, (fetchOllamaDeviceUsage(account, privateKey)), (usage));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_80_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(account)).mockResolvedValueOnce(json({ limits: {} })));
    await __jait_rejected(0, fetchOllamaDeviceUsage(account, privateKey));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_85_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.mocked(readFile).mockRejectedValue(new Error("EACCES private path"));
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await __jait_rejected(0, fetchOllamaDeviceUsage(account));
    __jait_capture(1, (readFile.mock.calls));
    __jait_capture(2, (fetchMock.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_94_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));
    await __jait_captureRejected(0, (fetchOllamaDeviceUsage(account, privateKey)));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_98_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("no", { status: 401 })));
    await __jait_captureRejected(0, (fetchOllamaDeviceUsage(account)));
    __jait_capture(1, (readFile.mock.calls));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_104_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    const pem = (data: Buffer) => `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
    for (const data of [Buffer.from("bad magic"), Buffer.from("openssh-key-v1\0")]) {
      __jait_thrown(0, () => parseOllamaDeviceKey(pem(data)));
    }
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json(account)).mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(json({ invalid: true })));
    await __jait_rejected(1, fetchSignedInOllamaUsage("http://localhost:11434", account));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
case "tailstatic_packages_gateway_src_services_ollama_device_auth_test_ts_113_3": {
await vi.mock("node:fs/promises", () => ({ readFile: vi.fn() }));
const { createPublicKey, generateKeyPairSync, verify } = await import("node:crypto");
const { readFile } = await import("node:fs/promises");
const { fetchOllamaDeviceUsage, fetchSignedInOllamaUsage, isLocalOllamaUrl, parseOllamaDeviceKey, signOllamaRequest } = await import("../../../../packages/gateway/src/services/ollama-device-auth.js");
const { privateKey, publicKey } = generateKeyPairSync("ed25519");
const account = { email: "me@example.com", name: "me", plan: "pro" };
const usage = { limits: { session: { usage: 0.508, models: [] }, weekly: { usage: 0.09, models: [] } } };
const json = (value: unknown) => new Response(JSON.stringify(value));
function fixture(cipher = "none") {
  const uint = (n: number) => { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; };
  const field = (value: string | Buffer) => { const b = Buffer.from(value); return Buffer.concat([uint(b.length), b]); };
  const jwk = privateKey.export({ format: "jwk" });
  const pub = Buffer.from(jwk.x!, "base64url");
  const secret = Buffer.concat([Buffer.from(jwk.d!, "base64url"), pub]);
  const pubBlob = Buffer.concat([field("ssh-ed25519"), field(pub)]);
  const inner = Buffer.concat([uint(42), uint(42), field("ssh-ed25519"), field(pub), field(secret), field("test")]);
  const padding = Buffer.from(Array.from({ length: 8 - inner.length % 8 }, (_, i) => i + 1));
  const data = Buffer.concat([Buffer.from("openssh-key-v1\0"), field(cipher), field("none"), field(""), uint(1), field(pubBlob), field(Buffer.concat([inner, padding]))]);
  return `-----BEGIN OPENSSH PRIVATE KEY-----\n${data.toString("base64")}\n-----END OPENSSH PRIVATE KEY-----`;
}
const __jait_hook_1792 = () => {
  vi.mocked(readFile).mockReset().mockResolvedValue(fixture());
  vi.stubEnv("JAIT_OLLAMA_DEVICE_KEY_PATH", "/test/ollama-key");
};
const __jait_hook_1944 = () => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); };
/*__jait_scope_open__*/{
await __jait_hook_1792();
try {
await (async()=>{

    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(json({ name: account.name })).mockResolvedValueOnce(new Response("missing", { status: 404 })).mockResolvedValueOnce(json(usage)));
    await __jait_captureResolved(0, (fetchOllamaDeviceUsage({ name: account.name }, privateKey)), (usage));
  
})();

} finally {
await __jait_hook_1944();
}
}

break;
}
default: throw new Error('unknown tailstatic fixture');
 }
 return __jait_observations;
}
