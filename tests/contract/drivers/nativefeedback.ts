import {NotificationService} from '../../../packages/gateway/src/services/notifications.ts';
import {UsageRefreshCache} from '../../../packages/gateway/src/services/usage-refresh-cache.ts';
import {summarizeProviderUsage} from '../../../packages/gateway/src/services/usage-summary.ts';
export async function dispatch(call:any) {
  const RealDate=Date;let now=call.now;
  globalThis.Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[now]) as [any]);}
    static now(){return new RealDate(now).getTime();}
  } as DateConstructor;
  try {
    if(call.op==='nativefeedback.summary')return summarizeProviderUsage(call.accounts,call.quotas,call.options);
    if(call.op==='nativefeedback.cache'){
      const cache=new UsageRefreshCache(()=>now);
      const handles=new Map<string,Promise<any>>();const releases=new Map<string,()=>void>();const loads:string[]=[];const results:any[]=[];
      const run=(step:any)=>{
        const promise=cache.run(step.key,async()=>{
          loads.push(step.handle);
          if(step.hold)await new Promise<void>(resolve=>releases.set(step.handle,resolve));
          if(step.error)throw new Error(step.error);
          return step.value;
        },{force:step.force,failed:step.failed?()=>true:undefined});
        // Install a rejection observer immediately, as a caller would.
        promise.catch(()=>{});
        const sameAs=[...handles].find(([,p])=>p===promise)?.[0]??null;
        handles.set(step.handle,promise);return {sameAs};
      };
      for(const step of call.steps){
        if(step.op==='run')results.push(run(step));
        else if(step.op==='time'){now=step.now;results.push(null);}
        else if(step.op==='release'){releases.get(step.handle)!();results.push(null);}
        else if(step.op==='await'){try{results.push({ok:await handles.get(step.handle)});}catch(e){results.push({error:(e as Error).message});}}
        else if(step.op==='bulk'){
          const batch=[];for(let i=0;i<step.count;i++){const handle='bulk'+i;run({key:handle,handle,value:i});batch.push(handles.get(handle));}
          await Promise.all(batch);results.push(null);
        }else throw new Error('unknown step');
        for(let i=0;i<6;i++)await Promise.resolve();
      }
      return {results,loads};
    }
    const events:any[]=[];const callbacks=new Map<string,(payload:any)=>void>();const subscriptions=new Map<string,()=>void>();
    let broadcastError=false;
    const service=new NotificationService({broadcastAll:(event:any)=>{
      events.push({kind:'broadcast',event:structuredClone(event)});
      if(broadcastError)throw new Error('broadcast failed');
    }} as any);
    const fired=new Set<string>();
    for(const [name,behavior] of Object.entries(call.sinks??{}) as Array<[string,any]>){
      callbacks.set(name,(payload:any)=>{
        events.push({kind:'sink',name,payload:structuredClone(payload)});
        if(behavior.op==='throw')throw new Error('sink failed');
        if(behavior.op==='mutate')payload[behavior.key]=behavior.value;
        if(!fired.has(name)){
          fired.add(name);
          if(behavior.op==='remove')subscriptions.get(behavior.alias)?.();
          if(behavior.op==='append')service.addSink(callbacks.get(behavior.name)!);
        }
      });
    }
    const results=[];
    for(const step of call.steps){
      try {
        if(step.op==='add')subscriptions.set(step.alias,service.addSink(callbacks.get(step.name)!));
        else if(step.op==='remove')subscriptions.get(step.alias)?.();
        else if(step.op==='send'){broadcastError=step.broadcastError??false;service.send(step.notification);}
        else if(step.op==='notify'){broadcastError=step.broadcastError??false;(service as any)[step.level](step.title,step.body,step.link);}
        else throw new Error('unknown step');
        results.push(null);
      }catch(e){results.push({error:(e as Error).message});}
    }
    return {results,events};
  }finally{globalThis.Date=RealDate;}
}
