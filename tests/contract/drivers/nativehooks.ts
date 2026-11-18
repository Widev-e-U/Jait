import {HookBus,registerBuiltInHooks} from '../../../packages/gateway/src/scheduler/hooks.ts';
export async function dispatch(call:any) {
  const bus=new HookBus();const events:any[]=[];const results:any[]=[];const handlers=new Map<string,(event:any)=>void>();const used=new Set<string>();
  const handler=(id:string)=>{
    let fn=handlers.get(id);if(fn)return fn;
    fn=(event:any)=>{
      events.push({id,event:structuredClone(event)});
      const action=call.actions?.[id];if(!action || used.has(id))return;used.add(id);
      switch(action.op) {
        case 'off':bus.off(action.type,handler(action.handler));break;
        case 'on':bus.on(action.type,handler(action.handler));break;
        case 'emit':bus.emit(action.type,action.payload);break;
        case 'throw':throw new Error('handler rejected');
        case 'mutate':event.payload=action.payload;break;
      }
    };handlers.set(id,fn);return fn;
  };
  if(call.builtins)registerBuiltInHooks(bus,{defaultProjectRoot:call.root});
  for(const step of call.steps) {
    try {
      let value:any=null;
      switch(step.op) {
        case 'on':bus.on(step.type,handler(step.handler));break;
        case 'off':bus.off(step.type,handler(step.handler));break;
        case 'emit':bus.emit(step.type,step.payload);break;
        case 'count':value=bus.listenerCount(step.type);break;
        case 'types':value=bus.registeredEventTypes();break;
        default:throw new Error('unknown hook operation');
      }
      results.push(value);
    } catch {results.push({error:true})}
  }
  return {results,events};
}
