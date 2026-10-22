import { backgroundCommandMonitor as monitor } from '../../../packages/gateway/src/services/background-command-monitor.ts';
function units(s:string){return Array.from({length:s.length},(_,i)=>s.charCodeAt(i));}
function result(r:any){return {session:r.sessionId,terminal:r.terminalId,command:r.command,code:r.exitCode,output:units(r.output),duration:r.durationMs,...(r.timedOut?{timedOut:true}:{})};}
export async function dispatch(call:any){
 monitor.clearForTests();
 let now=1000, next=0;
 const timers=new Map<number,{at:number,fn:()=>void}>();
 const saved={now:Date.now,set:globalThis.setTimeout,clear:globalThis.clearTimeout,warn:console.warn};
 const events:any[]=[],warnings:any[]=[],errors:string[]=[],surfaces=new Map<string,any>(),pending=new Map<string,any>(),subscriptions=new Map<string,()=>void>();
 Date.now=()=>now;
 globalThis.setTimeout=((fn:any,delay:number)=>{const id=++next;timers.set(id,{at:now+Math.max(0,delay),fn});return id;}) as any;
 globalThis.clearTimeout=((id:number)=>{timers.delete(id);}) as any;
 console.warn=(message:any)=>{warnings.push(units(String(message)));};
 function handler(id:string,fail=false){subscriptions.set(id,monitor.setCompletionHandler(r=>{events.push(['handler',id,result(r)]);if(fail)throw Error('handler');}));}
 handler('default');
 const snapshots:any[]=[];
 try{
  for(const a of call.actions){
   const id=a.id??'t',session=a.session??'s',command=a.command??'run';
   try{
    switch(a.op){
     case 'track':{
      const listeners=new Set<any>(), exits=new Set<any>();
      const surface={listeners,exits,addExitListener(l:any){exits.add(l);},removeExitListener(l:any){exits.delete(l);},addOutputListener(l:any){listeners.add(l);},removeOutputListener(l:any){listeners.delete(l);if(a.removeError)throw Error('remove');}};
      surfaces.set(id,surface);
      const ok=monitor.track({sessionId:session,terminalId:id,command,surface,executionId:a.execution,onCancel:a.cancel?()=>{events.push(["cancel",id]);}:undefined,onTimeout:a.deadline?()=>{events.push(["timeout",id]);}:undefined,completionToken:a.token,shell:a.shell,initialOutput:a.initial,startedAt:a.started,maxWatchMs:a.max,
       onOutput:r=>{events.push(['output',id,units(r)]);if(a.stopOnOutput)monitor.stopForSession(session);if(a.outputError)throw Error('output');},
       onComplete:r=>{events.push(['complete',id,r.exitCode,units(r.output)]);if(a.completeError)throw Error('complete');},
       onStop:()=>{events.push(['stop',id]);if(a.stopError)throw Error('stop');},shouldNotify:()=>a.notify!==false});
      events.push(['track',id,ok]); break;
     }
     case 'external':{
      let resolve:any,reject:any;const exitPromise=new Promise<any>((a,b)=>{resolve=a;reject=b;});pending.set(id,{resolve,reject});
      events.push(['track',id,monitor.trackExternal({sessionId:session,terminalId:id,command,executionId:a.execution,getOutput:()=>a.partial??"",startedAt:a.started??now,exitPromise,shouldNotify:()=>a.notify!==false,onCancel:()=>{events.push(['cancel',id]);if(a.cancelError)throw Error('cancel');}})]);break;
     }
     case 'resolve':pending.get(id).resolve({exitCode:a.code??null,output:a.output??'',timedOut:a.timedOut});break;
     case 'reject':pending.get(id).reject(Error('external'));break;
     case 'exit':for(const listener of [...(surfaces.get(id)?.exits??[])])listener(a.code??null);break;
     case 'emit':for(const listener of [...(surfaces.get(id)?.listeners??[])])listener(a.data);break;
     case 'inspect':case 'cancelExecution':{
      const value=a.op==='inspect'?monitor.inspectExecution(session,id,a.execution??id):monitor.cancelExecution(session,id,a.execution??id);
      events.push([a.op,value?{...value,output:units(value.output)}:null]);break;
     }
     case 'advance':{
      const target=now+a.ms;
      for(;;){const due=[...timers].filter(([,t])=>t.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;now=due[1].at;timers.delete(due[0]);try{due[1].fn();}catch(e){errors.push((e as Error).message);}}
      now=target;break;
     }
     case 'stop':monitor.stopForSession(session);break;
     case 'clear':monitor.clearForTests();break;
     case 'handler':handler(id,a.fail);break;
     case 'unsubscribe':subscriptions.get(id)?.();break;
     case 'report':monitor.reportCompletion({sessionId:session,terminalId:id,command,exitCode:a.code??null,output:a.output??'',durationMs:a.duration??0});break;
     default:throw Error('unknown action');
    }
   }catch(e){errors.push((e as Error).message);}
   for(let i=0;i<6;i++)await Promise.resolve();
   snapshots.push({active:monitor.activeCount,timers:timers.size,surfaces:[...surfaces].sort(([a],[b])=>a.localeCompare(b)).map(([id,s])=>[id,s.listeners.size,monitor.hasWatcherForTerminal(id)]),events:structuredClone(events),warnings:structuredClone(warnings),errors:[...errors]});
  }
  return snapshots;
 }finally{monitor.clearForTests();Date.now=saved.now;globalThis.setTimeout=saved.set;globalThis.clearTimeout=saved.clear;console.warn=saved.warn;}
}
