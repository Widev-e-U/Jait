/** Read-only quota contracts. HTTP is simulated; Codex uses only the supplied disposable fixture executable. */
import * as quota from '../../../packages/gateway/src/services/provider-quota-fetchers.ts';
export async function dispatch(call:any):Promise<unknown>{
 const op=call.op.slice('nativequota.'.length);
 if(op==='validate')return call.inputs.map((v:unknown)=>({codex:quota.isCodexRateLimitsResponse(v),quota:quota.isOllamaQuotaUsageResponse(v),usage:quota.isOllamaUsageResponse(v)}));
 if(op==='normalize')return call.inputs.map((v:any)=>{const normalized=quota.normalizeCodexRateLimits(v);return {value:normalized,same:normalized===v};});
 if(op==='transport'){
  try{const response=await fetch(call.url,{method:'GET',redirect:call.signed?'error':'follow',headers:{Authorization:'fixture-signature'},signal:AbortSignal.timeout(call.timeout??10000)});return {status:response.status,body:response.ok?await response.json():null};}
  catch(error:any){return {error:{name:error.name,message:error.message,status:null}};}
 }
 if(op==='gap')return quota.describeOllamaUsageGap(call.input);
 if(op==='codex'){
  try{return {value:await quota.fetchCodexRateLimits(call.home,{command:call.command,timeoutMs:call.timeout})};}
  catch(error:any){return {error:error.message};}
 }
 const previous=globalThis.fetch;const sent:unknown[]=[];const replies=[...(call.replies??[])];
 globalThis.fetch=(async(url:any,init:any={})=>{
  sent.push({url:String(url),method:init.method??'GET',authorization:new Headers(init.headers).get('Authorization')});
  if(call.real)return previous(url,init);
  const response=replies.shift();if(!response)throw new Error('unexpected fixture request');
  if(response.error)throw new Error(response.error);
  return new Response(response.raw??JSON.stringify(response.body??null),{status:response.status??200});
 })as typeof fetch;
 try{
  const value=op==='probe'?await quota.probeOllamaAccount(call.options??{}):op==='cloud'?await quota.fetchOllamaUsage(call.key,call.timeout):await quota.fetchOllamaUsageFrom(call.base,call.key,call.timeout);
  return {value,sent};
 }catch(error:any){return {error:{name:error.name,message:error.message,status:error.status??null},sent};}
 finally{globalThis.fetch=previous;}
}
