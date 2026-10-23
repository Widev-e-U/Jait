/** Actual session-wait subscriptions, including shared event identity and live Set iteration. */
import {SessionWaitService} from '../../../packages/gateway/src/services/session-waits.ts';
export async function dispatch(call:any){
 const service=new SessionWaitService();const callbacks=new Map<string,any>();const unsubs=new Map<string,()=>void>();const events:any[]=[];const retained:any[]=[];let mutated=false,nested=false;
 const copy=(v:any)=>JSON.parse(JSON.stringify(v??null));
 const callback=(name:string):any=>{
  if(!callbacks.has(name))callbacks.set(name,(change:any)=>{
   events.push({name,change:copy(change)});retained.push(change);
   if(call.mode==='mutation'){
    if(name==='broadcaster'&&!mutated){mutated=true;unsubs.get('b')!();unsubs.set('d',service.subscribe(callback('d')));change.sessionId='mutated';if(change.waits[0])change.waits[0].label='changed by broadcaster';}
    if(name==='a')change.waits=[];
   }
   if(call.mode==='nested'&&name==='a'&&!nested){nested=true;unsubs.get('a')!();service.clear('key');}
   if((call.mode==='failure-broadcaster'&&name==='broadcaster')||(call.mode==='failure-subscriber'&&name==='b'))throw Error('delivery failed');
  });return callbacks.get(name);
 };
 const results:any[]=[];
 for(const step of call.steps){
  try{let value:any=null;switch(step.op){
   case 'subscribe':unsubs.set(step.alias,service.subscribe(callback(step.name)));break;
   case 'unsubscribe':unsubs.get(step.alias)!();break;
   case 'broadcaster':service.setBroadcaster(step.name?callback(step.name):undefined);break;
   case 'raise':value=service.raise(step.input);break;
   case 'clear':value=service.clear(step.key);break;
   case 'reset':service.clearForTests();break;
   default:throw Error('unknown subscription fixture op');
  }results.push({value:copy(value),snapshot:copy(service.snapshot())});}
  catch(error){results.push({error:error instanceof Error?error.message:String(error),snapshot:copy(service.snapshot())});}
 }
 return {results,events,retained,snapshot:service.snapshot()};
}
