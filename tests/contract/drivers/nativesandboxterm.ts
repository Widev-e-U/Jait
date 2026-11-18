/** Execute the actual startup adapter and monitor with virtual timers and process I/O. */
import {createHash} from 'node:crypto';
import {backgroundCommandMonitor as monitor} from '../../../packages/gateway/src/services/background-command-monitor.ts';
let loaded:Promise<any>|undefined;
async function factory(){return loaded??=(async()=>{
 let source=await Bun.file(new URL('../../../packages/gateway/src/tools/sandbox-background-terminal.ts',import.meta.url)).text();
 for(const [from,to] of [
  ['import { uuidv7 } from "../db/uuidv7.js";','const uuidv7=()=>"018f0011-2233-7444-8555-667788990011";'],
  ['import { backgroundCommandMonitor } from "../services/background-command-monitor.js";','const backgroundCommandMonitor=globalThis.__sandboxMonitor;'],
 ]){if(source.split(from).length!==2)throw Error('Sandbox binding changed');source=source.replace(from,to);}
 const code=new Bun.Transpiler({loader:'ts'}).transformSync(source);
 const path=new URL('../../../.jait/artifacts/gateway-rust/sandbox-terminal/fixtures/'+createHash('sha256').update(code).digest('hex')+'.mjs',import.meta.url);
 await Bun.write(path,code);(globalThis as any).__sandboxMonitor=monitor;return import(path.href);
})();}
const units=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
function normalizeResult(r:any){if(r?.data?.output!==undefined)r.data.output=units(r.data.output);return r;}
function snapshot(r:any){if(!r)return null;return {...r,output:units(r.output)};}
async function flush(){for(let i=0;i<12;i++)await Promise.resolve();}
export async function dispatch(call:any){
 const module=await factory(),results=[];
 for(const test of call.cases){
  monitor.clearForTests();let now=1000,next=0,stopped=0,output='',endedAt:any=null,result:any=null,error:any=null;
  const timers=new Map<number,{at:number,fn:()=>void}>(),listeners=new Set<any>(),abortListeners=new Set<any>();
  const started:any[]=[],chunks:any[]=[],notifications:any[]=[],inspections:any[]=[];
  const savedNow=Date.now,savedSet=globalThis.setTimeout,savedClear=globalThis.clearTimeout;
  Date.now=()=>now;
  globalThis.setTimeout=((fn:any,ms:any)=>{const id=++next;timers.set(id,{at:now+Math.max(1,Number(ms)||1),fn});return id;})as any;
  globalThis.clearTimeout=((id:any)=>{timers.delete(id);})as any;
  let resolve:any;
  const completion=new Promise<any>(r=>{resolve=r;});
  const complete=(overrides:any={})=>resolve({ok:true,output,exitCode:0,timedOut:false,containerName:'container',...overrides});
  const signal={aborted:!!test.preAborted,
   addEventListener(_name:any,f:any){abortListeners.add(f);if(test.abortRace)this.aborted=true;},
   removeEventListener(_name:any,f:any){abortListeners.delete(f);}};
  const abort=()=>{if(signal.aborted)return;signal.aborted=true;for(const f of [...abortListeners]){abortListeners.delete(f);f();}};
  const execution={containerName:'container',get output(){return output;},completion,
   onOutput(f:any){listeners.add(f);return()=>listeners.delete(f);},
   stop(){stopped++;if(test.stopCompletes)complete({ok:false,exitCode:null});return test.stopError?Promise.reject(Error(test.stopError)):Promise.resolve();}};
  const manager={startBackgroundCommand(options:any){started.push(options);if(test.startError)throw Error(test.startError);return execution;}};
  monitor.setCompletionHandler(r=>{notifications.push({session:r.sessionId,terminal:r.terminalId,command:r.command,output:units(r.output),exitCode:r.exitCode,timedOut:r.timedOut??false,durationMs:r.durationMs});});
  try{
   if(test.capacity)for(let i=0;i<50;i++)monitor.trackExternal({sessionId:'busy',terminalId:'busy-'+i,command:'held',startedAt:now,exitPromise:new Promise(()=>{})});
   const context:any={sessionId:'owner',actionId:test.noAction?undefined:'action',sandboxContainerName:test.thread?'thread-container':undefined,signal,onOutputChunk:(s:string)=>chunks.push(units(s))};
   const pending=module.runSandboxBackgroundTerminal(manager,{command:'fixture',containerName:'existing',timeoutMs:10000,...test.options},'visible command',context,test.wait).then((r:any)=>{result=normalizeResult(r);endedAt=now-1000;},(e:any)=>{error=e.message;endedAt=now-1000;});
   await flush();
   const advance=async(target:number)=>{for(;;){const due=[...timers].filter(([,v])=>v.at<=target).sort((a,b)=>a[1].at-b[1].at||a[0]-b[0])[0];if(!due)break;now=due[1].at;timers.delete(due[0]);due[1].fn();await flush();}now=target;await flush();};
   for(const step of test.steps??[]){await advance(1000+step.at);
    if(step.kind==='output'){output+=step.text;for(const f of [...listeners])f(step.text);}
    if(step.kind==='complete')complete(step.result);
    if(step.kind==='abort')abort();
    if(step.kind==='inspect'||step.kind==='cancel'){
     const owner=step.foreign?'foreign':'owner',id=step.stale?'stale':test.noAction?'sandbox-command-018f0011-2233-7444-8555-667788990011':'action';
     const value=step.kind==='cancel'?monitor.cancelExecution(owner,'sandbox-command-018f0011-2233-7444-8555-667788990011',id):monitor.inspectExecution(owner,'sandbox-command-018f0011-2233-7444-8555-667788990011',id);
     inspections.push(snapshot(value));
    }
    await flush();
   }
   await advance(1000+(test.finishAt??6000));await flush();
   if(endedAt===null)throw Error('virtual case did not settle');await pending;
   results.push({result,error,endedAt,started,stopped,chunks,outputListeners:listeners.size,abortListeners:abortListeners.size,pendingTimers:timers.size,active:monitor.activeCount,notifications,inspections});
  }finally{monitor.clearForTests();Date.now=savedNow;globalThis.setTimeout=savedSet;globalThis.clearTimeout=savedClear;}
 }
 return results;
}
