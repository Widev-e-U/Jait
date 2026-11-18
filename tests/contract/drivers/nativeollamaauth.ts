/** Test-only filesystem/home boundary; all cryptography and auth exports run from current source. */
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as io from './nativeollamaio.ts';
const originalUrl=new URL('../../../packages/gateway/src/services/ollama-device-auth.ts',import.meta.url);
const directory=new URL('../../../.jait/artifacts/gateway-rust/ollama-device-auth/reference-copies/'+crypto.randomUUID()+'/',import.meta.url);
mkdirSync(directory,{recursive:true});
let source=readFileSync(originalUrl,'utf8');
for(const [from,to]of [
 ['from "node:fs/promises"','from '+JSON.stringify(fileURLToPath(new URL('./nativeollamaio.ts',import.meta.url)))],
 ['from "node:os"','from '+JSON.stringify(fileURLToPath(new URL('./nativeollamaio.ts',import.meta.url)))],
 ['from "./provider-quota-fetchers.js"','from '+JSON.stringify(fileURLToPath(new URL('./provider-quota-fetchers.ts',originalUrl)))],
] as const){if(source.split(from).length!==2)throw new Error('auth import boundary changed');source=source.replace(from,to);}
const moduleUrl=new URL('current-source.ts',directory);writeFileSync(moduleUrl,source);
const auth=await import(fileURLToPath(moduleUrl));
export async function dispatch(call:any):Promise<unknown>{
 if(typeof call.op!=='string'||!call.op.startsWith('nativeollamaauth.'))throw new Error('unknown auth operation');
 const op=call.op.slice('nativeollamaauth.'.length);
 const originalKeyPath=process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;
 const originalPlatform=Object.getOwnPropertyDescriptor(process,'platform')!;
 const originalFetch=globalThis.fetch,originalNow=Date.now;
 const sent:any[]=[];io.configure(call.reads??[],call.home??'/fixture/home');
 if(call.configured===null||call.configured===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=call.configured;
 Object.defineProperty(process,'platform',{...originalPlatform,value:call.platform??'linux'});
 Date.now=()=>call.now??1234567;
 const replies=[...(call.replies??[])];
 globalThis.fetch=(async(url:any,init:any={})=>{
  const headers=new Headers(init.headers);
  sent.push({url:String(url),method:init.method??'GET',authorization:headers.get('Authorization'),accept:headers.get('Accept'),reject_redirects:init.redirect==='error',timeout_ms:10000});
  const next=replies.shift();if(!next)throw new Error('Unexpected fixture request');
  if(next.error){const error:any=new Error(next.error);if(next.name)error.name=next.name;if(next.status!==undefined)error.status=next.status;throw error;}
  return new Response(next.raw??JSON.stringify(next.body??null),{status:next.status??200,headers:{'Content-Type':'application/json'}});
 }) as typeof fetch;
 try{
  let result:unknown;
  if(op==='local')result=call.urls.map(auth.isLocalOllamaUrl);
  else if(op==='paths')result=auth.ollamaDeviceKeyPaths();
  else if(op==='parse')result={signature:auth.signOllamaRequest(auth.parseOllamaDeviceKey(call.pem),call.method??'GET',call.path??'/api/usage',call.timestamp??'123')};
  else if(op==='device')result=await auth.fetchOllamaDeviceUsage(call.account,call.pem?auth.parseOllamaDeviceKey(call.pem):undefined);
  else if(op==='signed')result=await auth.fetchSignedInOllamaUsage(call.base,call.account);
  else throw new Error('unknown auth operation');
  return {value:result,sent,reads:io.observedPaths()};
 }catch(error:any){return {error:{name:error.name,message:error.message,status:error.status??null},sent,reads:io.observedPaths()};}
 finally{globalThis.fetch=originalFetch;Date.now=originalNow;Object.defineProperty(process,'platform',originalPlatform);if(originalKeyPath===undefined)delete process.env.JAIT_OLLAMA_DEVICE_KEY_PATH;else process.env.JAIT_OLLAMA_DEVICE_KEY_PATH=originalKeyPath;}
}
