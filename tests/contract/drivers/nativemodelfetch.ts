/** The real fetcher module; only fetch, clock and import-time cap configuration are controlled. */
import {pathToFileURL, fileURLToPath} from 'node:url';
const source=fileURLToPath(new URL('../../../packages/gateway/src/providers/model-fetchers.ts',import.meta.url));
const settle=()=>new Promise<void>(resolve=>setImmediate(resolve));
export async function dispatch(call:any) {
  const originalFetch=globalThis.fetch, originalNow=Date.now, originalTimeout=globalThis.setTimeout;
  const oldCap=process.env.OMNIROUTE_MAX_MODELS;
  let now=call.now??1_000_000, timeoutMs=0;
  const requests:any[]=[], scripts=[...(call.responses??[])];
  const releases=new Map<string,()=>void>(), pending=new Map<string,Promise<any>>();
  try {
    if (typeof call.cap==='string') process.env.OMNIROUTE_MAX_MODELS=call.cap;
    else delete process.env.OMNIROUTE_MAX_MODELS;
    Date.now=()=>now;
    (globalThis as any).setTimeout=(fn:any,ms:any,...args:any[])=>{
      timeoutMs=Number(ms); return originalTimeout(fn,ms,...args);
    };
    globalThis.fetch=(async (url:any,init:any)=>{
      requests.push({url:String(url),authorization:init.headers?.Authorization??null,timeoutMs,method:init.method??'GET'});
      if (!init.signal || !(init.signal instanceof AbortSignal)) throw new Error('reference omitted abort signal');
      const script=scripts.shift(); if (!script) throw new Error('unscripted request');
      if (script.hold) await new Promise<void>(resolve=>releases.set(script.hold,resolve));
      if (script.error) throw new Error(script.error);
      const body=script.bytes ? new Uint8Array(script.bytes) : script.body!==undefined ? script.body : JSON.stringify(Object.hasOwn(script,'json')?script.json:{});
      return new Response(body,{status:script.status??200});
    }) as typeof fetch;
    const reference=await import(pathToFileURL(source).href+'?native-models='+crypto.randomUUID());
    if (call.op==='nativemodelfetch.filters') return call.ids.map((id:any)=>({chat:reference.isChatCapableOpenAIModelId(id),reasoning:reference.supportsReasoningEffort(id)}));
    if (call.op==='nativemodelfetch.cloudmap') {
      try { return {ok:true,wire:JSON.stringify(reference.mapOllamaCloudModels(call.tags))}; } catch {return {ok:false};}
    }
    reference.resetModelFetcherCaches();
    const fetcher=(step:any)=>{
      switch(step.kind) {
        case 'openai': return reference.fetchOpenAIModels(step.key??'',step.url??'http://models.fixture/v1');
        case 'openrouter': return reference.fetchOpenRouterModels(step.key??'');
        case 'ollama': return reference.fetchOllamaModels(step.url??'http://models.fixture/v1', {force:step.force,includeCloud:step.includeCloud});
        case 'omniroute': return reference.fetchOmniRouteModels(step.key??'',step.url??'http://models.fixture/v1');
        default: throw new Error('unknown catalogue kind');
      }
    };
    const result=(promise:Promise<any>)=>promise.then(models=>({ok:true,wire:JSON.stringify(models)}),()=>({ok:false}));
    if (call.op==='nativemodelfetch.live') {
      for (const step of call.steps) if (new URL(step.url).hostname!=='127.0.0.1') throw new Error('live fixture must be loopback');
      globalThis.fetch=originalFetch;
      const results=[];
      for (const step of call.steps) results.push(await result(fetcher(step)));
      return results;
    }
    const results:any[]=[];
    for (const step of call.steps) {
      switch(step.action??'fetch') {
        case 'fetch': results.push(await result(fetcher(step))); break;
        case 'parallel': results.push(await Promise.all(Array.from({length:step.count},()=>result(fetcher(step))))); break;
        case 'begin': pending.set(step.id,result(fetcher(step))); await settle(); results.push('started'); break;
        case 'wait': results.push(await pending.get(step.id)); break;
        case 'release': releases.get(step.id)?.(); results.push('released'); break;
        case 'tick': now=step.now; results.push('tick'); break;
        case 'reset': reference.resetModelFetcherCaches(); results.push('reset'); break;
        default: throw new Error('unknown step');
      }
      await settle();
    }
    await Promise.all(pending.values());
    return {results,requests};
  } finally {
    for (const release of releases.values()) release();
    globalThis.fetch=originalFetch; Date.now=originalNow; globalThis.setTimeout=originalTimeout;
    if (oldCap===undefined) delete process.env.OMNIROUTE_MAX_MODELS; else process.env.OMNIROUTE_MAX_MODELS=oldCap;
  }
}
