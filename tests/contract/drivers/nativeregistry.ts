import {ProviderRegistry,buildOmniRouteMcpServerRef} from '../../../packages/gateway/src/providers/registry.ts';
export async function dispatch(call:any) {
 const registry=new ProviderRegistry();
 const envKeys=['JAIT_OMNIROUTE_MCP','OMNIROUTE_API_KEY','OMNIROUTE_BASE_URL'];
 const before=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 for(const k of envKeys){if(call.env?.[k]===undefined)delete process.env[k];else process.env[k]=call.env[k];}
 if(call.op==='nativeregistry.refs') {
  try {
   const one=registry.buildJaitMcpServerRef(call.config,call.base,call.context);
   const all=registry.buildJaitMcpServerRefs(call.config,call.base,call.context);
   return {one,all,omniroute:buildOmniRouteMcpServerRef(call.env??{})};
  }catch(e:any){return {error:e.message};}
  finally{for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}}
 }
 for(const k of envKeys){if(before[k]===undefined)delete process.env[k];else process.env[k]=before[k];}
 const events:string[]=[];const errors:string[]=[];const defs=new Map<string,any>();const names=new WeakMap<object,string>();
 let pending:Promise<unknown>|undefined;
 const errorLog=console.error;console.error=(...args:any[])=>errors.push(args[1]?.message??String(args[1]));
 const results=[];
 try{
  for(const s of call.steps){
   try{
    let v:any=null;
    switch(s.action){
     case 'register': {
      const d=s.def;
      const info=structuredClone(d.info??{id:d.id,label:d.alias});
      let release:any;
      const hold=d.hold?new Promise<void>(resolve=>release=resolve):undefined;
      const p:any={id:d.id,ownerUserId:d.owner,info,
       async checkAvailability(){events.push('check:'+d.alias);if(hold)await hold;if(d.checkError)throw new Error(d.checkError);info.checked=true;},
      };
      if(!d.noDispose)p.dispose=async()=>{events.push('dispose:'+d.alias);if(d.disposeError)throw new Error(d.disposeError);};
      names.set(p,d.alias);defs.set(d.alias,{p,release});registry.register(p);break;
     }
     case 'get':v=names.get(registry.get(s.id)as any)??null;break;
     case 'getUser':v=names.get(registry.getForUser(s.id,s.user)as any)??null;break;
     case 'visible':v=registry.isVisibleTo(s.id,s.user);break;
     case 'throw':v=names.get(registry.getOrThrow(s.id));break;
     case 'list':v=registry.list().map(p=>names.get(p));break;
     case 'unregister':v=await registry.unregister(s.id);break;
     case 'check':v=await registry.checkAll();break;
     case 'begin':pending=registry.checkAll();break;
     case 'release':defs.get(s.alias).release?.();break;
     case 'finish':v=await pending;break;
     default:throw new Error('unknown registry fixture action');
    }
    results.push(structuredClone(v));
   }catch(e:any){results.push({error:e.message});}
  }
  return {results,events,errors};
 }finally{console.error=errorLog;}
}
