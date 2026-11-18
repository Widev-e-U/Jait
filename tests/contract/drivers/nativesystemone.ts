/** Execute the actual bounded-decision service/tool with controlled transport and time. */
import { resolveSystemOne, systemOneEnabled, evaluateDecision, rankSystemOne, SYSTEM_ONE_PROMPT } from '../../../packages/gateway/src/services/system-one.ts';
import { createDecisionEvaluateTool } from '../../../packages/gateway/src/tools/decision.ts';
export async function dispatch(call:any):Promise<any> {
  if(call.op==='nativesystemone.resolve') return {endpoint:resolveSystemOne(call.keys),enabled:systemOneEnabled(call.keys)};
  if(call.op==='nativesystemone.metadata') {const {execute,...metadata}=createDecisionEvaluateTool();return {metadata,prompt:SYSTEM_ONE_PROMPT};}
  if(call.op!=='nativesystemone.trace') throw new Error('unknown decision operation');
  const savedFetch=globalThis.fetch,savedNow=Date.now,savedTimeout=AbortSignal.timeout;
  let now=call.now??1000000,step=0,controller:AbortController|undefined,lastTimeout:AbortController|undefined,lastTimeoutMs=0;
  const requests:any[]=[],results:any[]=[];
  Date.now=()=>now;
  AbortSignal.timeout=((ms:number)=>{lastTimeoutMs=ms;lastTimeout=new AbortController();return lastTimeout.signal;}) as any;
  globalThis.fetch=(async(url:any,init:any)=>{
    requests.push({url:String(url),method:init.method,redirect:init.redirect,headers:init.headers,body:init.body,timeoutMs:lastTimeoutMs});
    const reply=call.responses?.[step++]??{status:503};
    if(reply.abort){controller?.abort(new Error('cancelled-fixture'));throw controller?.signal.reason??new Error('cancelled-fixture');}
    if(reply.error) throw new Error(reply.error);
    if(reply.timeout) return await new Promise((_resolve,reject)=>{
      init.signal.addEventListener('abort',()=>reject(init.signal.reason),{once:true});
      queueMicrotask(()=>lastTimeout!.abort(new DOMException('The operation timed out.','TimeoutError')));
    });
    const status=reply.status??200;
    return {ok:status>=200&&status<300,status,json:async()=>{if(reply.jsonError)throw new Error(reply.jsonError);return reply.body;}} as Response;
  }) as typeof fetch;
  try {
    for(const action of call.actions) {
      if(action.op==='clock'){now=action.now;results.push(null);continue;}
      controller=action.aborted||action.signal?new AbortController():undefined;
      if(action.aborted)controller!.abort(new Error('cancelled-fixture'));
      const keys=action.keys??call.keys,signal=controller?.signal;
      try {
        if(action.op==='eval') results.push({ok:true,value:await evaluateDecision(keys,action.state,action.questions,signal)});
        else if(action.op==='rank') {
          const scores:any[]=[],described:any[]=[];
          try {
            const items=await rankSystemOne(keys,action.query,action.items,(item:any)=>{
              described.push(item);if(action.describeThrowAt===described.length)throw new Error('describe failed');
              return typeof item==='string'?item:String(item.description??item.id??'item');
            },action.purpose??'candidate',signal,action.onScore===false?undefined:(item:any,score:number)=>{
              scores.push({item,score});if(action.scoreThrowAt===scores.length)throw new Error('onScore failed');
            },action.minimum);
            results.push({ok:true,value:items,scores,described});
          } catch(error) {results.push({ok:false,message:(error as Error).message,scores,described});}
        } else if(action.op==='tool') {
          results.push({ok:true,value:await createDecisionEvaluateTool().execute(action.input,{apiKeys:keys,signal,sessionId:'fixture-session',actionId:'fixture-action',projectRoot:import.meta.dirname,requestedBy:'test'} as any)});
        } else throw new Error('unknown decision action');
      } catch(error) {results.push({ok:false,message:(error as Error).message});}
    }
    return {results,requests};
  } finally {globalThis.fetch=savedFetch;Date.now=savedNow;AbortSignal.timeout=savedTimeout;}
}
