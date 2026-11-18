/** Test-only simulated browser callbacks; no Messenger messages are sent. */
import { MessengerBridge } from '../../../packages/gateway/src/services/messenger-bridge.ts';
import { messengerCommandSchema } from '../../../packages/shared/src/messenger.ts';
const expandedResult = (step:any) => {const result={...step.result};if(typeof result.dataRepeat === 'number'){result.data='x'.repeat(result.dataRepeat);delete result.dataRepeat;}return result;};
export async function dispatch(call:any):Promise<unknown> {
 if (call.op === 'nativebridge.parse') {
  return call.inputs.map((value: unknown) => {const parsed = messengerCommandSchema.safeParse(value); return parsed.success ? parsed.data : null;});
 }
 if(call.op !== 'nativebridge.sequence') throw new Error('unknown bridge operation');
 const bridge = new MessengerBridge();
 const sent: unknown[] = [], outcomes: unknown[] = [], gateway: unknown[] = [], counts: unknown[] = [];
 const requests = new Map(), signals = new Map();
 let currentId = '';
 let now = 1000, sequence = 0;
 const timers = new Map<number,{due:number,fn:()=>void}>();
 const originalSet = globalThis.setTimeout, originalClear = globalThis.clearTimeout, originalNow = Date.now;
 globalThis.setTimeout = ((fn:()=>void, ms = 0) => {
  const delay = !Number.isFinite(ms) || ms < 1 || ms > 2147483647 ? 1 : Math.trunc(ms);
  const id = ++sequence; timers.set(id,{due:now+delay,fn}); return id;
 }) as any;
 globalThis.clearTimeout = ((id:number) => {timers.delete(id);}) as any;
 Date.now = () => now;
 try {
  for (const step of call.steps) {
   switch (step.op) {
    case 'register': bridge.register(step.id, { userId:step.owner,
     active:()=>{if(step.activeError) throw new Error('active failed');return step.active !== false;},
     send:request=>{
      requests.set(currentId,request);
      sent.push({id:currentId,client:step.id,expiresAt:request.expiresAt,command:request.command});
      if (step.result) bridge.complete(step.id,step.owner,request.requestId,step.result);
      if (step.disconnect) throw new Error('send failed');
     },
    });break;
    case 'unregister':bridge.unregister(step.id);break;
    case 'gateway':bridge.setGatewayHandler(step.enabled ? async(owner,command,signal)=>{
     gateway.push({owner,command,aborted:signal?.aborted??false});
     if(step.fail)throw new Error('gateway failed');
     if(step.reenter)bridge.setGatewayHandler(undefined);
     return {ok:true,message:'gateway response',data:command};
    }:undefined);break;
    case 'request': {
     currentId=step.id;const controller=step.signal?new AbortController():undefined;
     if (controller){signals.set(step.id,controller);if(step.aborted)controller.abort();}
     void bridge.request(step.owner,step.input,controller?.signal,step.timeout).then(
      result=>outcomes.push({id:step.id,result:{ok:result.ok,messageUnits:Array.from({length:result.message.length},(_,i)=>result.message.charCodeAt(i)),...(result.data===undefined?{}:{data:result.data})}}),error=>outcomes.push({id:step.id,error:error.message}));break;
    }
    case 'complete':{const request=requests.get(step.id);bridge.complete(step.client,step.owner,request?.requestId??'absent',expandedResult(step));break;}
    case 'abort':signals.get(step.id)?.abort();break;
    case 'tick':{
     const end=now+step.ms;
     while(true){const next=[...timers].filter(([,timer])=>timer.due<=end).sort((a,b)=>a[1].due-b[1].due||a[0]-b[0])[0];
      if(!next)break;now=next[1].due;timers.delete(next[0]);next[1].fn();}
     now=end;break;
    }
    case 'stop':bridge.stop();break;
    default:throw new Error('unknown bridge action');
   }
   for(let i=0;i<4;i++)await Promise.resolve();
   counts.push((bridge as any).pending.size);
  }
  bridge.stop();
  for(let i=0;i<4;i++)await Promise.resolve();
  return {sent,outcomes,gateway,counts,timers:timers.size};
 } finally {globalThis.setTimeout=originalSet;globalThis.clearTimeout=originalClear;Date.now=originalNow;bridge.stop();}
}
