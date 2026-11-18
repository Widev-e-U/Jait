/** Executes the unchanged production protocol adapter with an isolated fetch
 * effect and byte-stream source. No vendor requests, API keys or real hosts. */
import {goProtocol,goRequest,fetchJaitLlm} from '../../../packages/gateway/src/services/opencode-go-fetch.ts';
export async function dispatch(call:any) {
 if(call.op==='nativegofetch.protocol') return goProtocol(call.model);
 if(call.op==='nativegofetch.request') {try{return {value:goRequest(call.body,call.protocol)}}catch{return {error:'invalid-input'}}}
 const capture:any={};let cancelled=false;let sourceCancelled=false;
 const error=(e:any)=>e?.name==='SyntaxError'||e?.name==='TypeError'?'invalid-input':String(e?.message??e);
 const saved=globalThis.fetch;
 const abort=new AbortController();if(call.abortBefore)abort.abort();
 const llm={backend:'opencode-go',openaiModel:'claude-test',openaiApiKey:'fixture-key',openaiBaseUrl:'https://example.invalid/zen/go/v1',sessionId:'scope-1',...call.llm};
 let inputBody=typeof call.bodyRaw==='string'?call.bodyRaw:JSON.stringify(call.body??{});
 try {
  globalThis.fetch=(async(url:any,init:any)=>{
   capture.url=String(url);capture.method=init.method??null;capture.headers=init.headers===undefined?null:Object.fromEntries(new Headers(init.headers));
   capture.body=init.body===undefined?null:(()=>{try{return JSON.parse(String(init.body))}catch{return String(init.body)}})();
   capture.extensions=init.fixture??null;capture.signal=init.signal===abort.signal;
   if(call.fetchError)throw new Error(call.fetchError);
   const r=call.response??{};let position=0;
   const bytes=r.chunks??(r.body===null?null:[Array.from(new TextEncoder().encode(typeof r.body==='string'?r.body:JSON.stringify(r.body??{})))]);
   const stream=bytes===null?null:new ReadableStream({
    pull(controller){if(position<bytes.length)controller.enqueue(Uint8Array.from(bytes[position++]));else if(r.sourceError)controller.error(new Error(r.sourceError));else controller.close()},
    cancel(){sourceCancelled=true},
   },{highWaterMark:0});
   return new Response(stream,{status:r.status??200,headers:r.headers??{'content-type':'application/json'}});
  }) as typeof fetch;
  const init:any={method:call.method??'POST',body:inputBody,signal:abort.signal,fixture:call.extensions??null};
  if(Object.hasOwn(call,'headers'))init.headers=call.headers;
  const response=await fetchJaitLlm(llm,call.url??'https://original.invalid/completions',init);
  const result:any={request:capture,status:response.status,headers:Object.fromEntries(response.headers)};
  let body='';
  try {
   if(response.body){const reader=response.body.getReader();let reads=0;while(true){const next=await reader.read();if(next.done)break;body+=new TextDecoder().decode(next.value);reads++;if(call.consume==='cancel'&&reads===1){await reader.cancel('user');cancelled=true;break}}}
   if(response.headers.get('content-type')?.includes('text/event-stream'))result.frames=body.split('\n\n').filter(Boolean).map(frame=>{const s=frame.slice(6);return s==='[DONE]'?'[DONE]':JSON.parse(s)});
   else {try{result.value=JSON.parse(body)}catch{result.raw=body}}
  }catch(e){result.error=error(e)}
  result.cancelled=cancelled;result.sourceCancelled=sourceCancelled;
  if(call.inspectUnicode){const contains=(v:any):boolean=>typeof v==='string'?[...v].some(c=>{const n=c.charCodeAt(0);return n>=0xd800&&n<=0xdfff&&c.length===1}):Array.isArray(v)?v.some(contains):v&&typeof v==='object'?Object.values(v).some(contains):false;return {effect:!!capture.url,requestLone:contains(capture),responseLone:contains(result.frames??result.value),error:result.error??null}}
  return result;
 }catch(e){return {request:capture,error:error(e),cancelled,sourceCancelled}}
 finally{globalThis.fetch=saved}
}
