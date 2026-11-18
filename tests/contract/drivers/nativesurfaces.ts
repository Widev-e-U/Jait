import {SurfaceRegistry} from '../../../packages/gateway/src/surfaces/registry.ts';
import {shouldSyncProjectSurfaceUi} from '../../../packages/gateway/src/surfaces/project-ui-sync.ts';
class FixtureSurface {
  state='idle';sessionId:string|null=null;metadata:any;id:string;type:string;config:any;
  constructor(id:string,type:string,config:any,private events:any[]){this.id=id;this.type=type;this.config=config;this.metadata={factory:config.label??'fixture',...(config.metadata??{})};this.state=config.state??'idle';this.sessionId=config.sessionId??null}
  async start(input:any){this.events.push({event:'start',id:this.id,input});this.state='starting';this.sessionId=input.sessionId;await Promise.resolve();if(this.config.failStart){this.state='error';throw new Error('start fixture')}this.state='running'}
  async stop(input:any){this.events.push({event:'stop',id:this.id,reason:input?.reason??null});this.state='stopping';await Promise.resolve();if(this.config.failStop){this.state='error';throw new Error('stop fixture')}this.state='stopped';if(input?.reason!==undefined)this.metadata.lastReason=input.reason}
  snapshot(){if(this.config.failSnapshot)throw new Error('snapshot fixture');return {id:this.id,type:this.type,state:this.state,sessionId:this.sessionId??'',metadata:{...this.metadata}}}
}
export async function dispatch(call:any){
  if(call.op!=='nativesurfaces.registry')throw new Error('unknown surface operation');
  const registry=new SurfaceRegistry();const events:any[]=[];const results:any[]=[];
  const describe=(surface:any):any=>{if(!surface)return null;return {id:surface.id,type:surface.type,state:surface.state,sessionId:surface.sessionId,owner:registry.getOwner(surface.id)??null}};
  for(const step of call.steps){
    try{
      let result:any=null;
      switch(step.op){
        case 'register':registry.register({type:step.type,create(id:string){if(step.failCreate)throw new Error('create fixture');return new FixtureSurface(id,step.type,{...(call.configs?.[id]??{}),label:step.label??'fixture'},events) as any}});break;
        case 'instance':registry.registerInstance(step.key,new FixtureSurface(step.id,step.type,step.config??{},events) as any);break;
        case 'owner':registry.setOwner(step.id,step.user);break;
        case 'getOwner':result=registry.getOwner(step.id)??null;break;
        case 'callbacks':
          registry.onSurfaceStarted=step.started===false?undefined:(id,surface)=>{events.push({event:'started',id,snapshot:surface.snapshot(),owner:registry.getOwner(id)??null});if(step.failStarted)throw new Error('started callback')};
          registry.onSurfaceStopped=step.stopped===false?undefined:(id,surface,context)=>{events.push({event:'stopped',id,snapshot:surface.snapshot(),state:surface.state,reason:context?.reason??null,owner:registry.getOwner(id)??null});if(step.failStopped)throw new Error('stopped callback')};break;
        case 'start':result=describe(await registry.startSurface(step.type,step.id,step.input));break;
        case 'duringStart':{const pending=registry.startSurface(step.type,step.id,step.input);const during=describe(registry.getSurface(step.id));result={during,result:describe(await pending)};break;}
        case 'duringStop':{const pending=registry.stopSurface(step.id,step.reason);const during=describe(registry.getSurface(step.id));result={during,result:await pending};break;}
        case 'stop':result=await registry.stopSurface(step.id,step.reason);break;
        case 'stopAll':await registry.stopAll(step.reason);break;
        case 'get':result=describe(registry.getSurface(step.id));break;
        case 'list':result=registry.listSurfaces().map(describe);break;
        case 'snapshots':result=registry.listSnapshots();break;
        case 'session':result=registry.getBySession(step.session).map(describe);break;
        case 'types':result=registry.registeredTypes;break;
        case 'unregister':result=registry.unregister(step.id);break;
        case 'sync':result=shouldSyncProjectSurfaceUi(registry.getSurface(step.id)!);break;
        default:throw new Error('unknown surface step');
      }
      results.push(structuredClone(result));
    }catch(error:any){results.push({error:true,message:error.message})}
  }
  return {results,events};
}
