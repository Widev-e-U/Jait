/** Actual TS admission/lifecycle under explicitly controlled sandbox completion. */
import {loadLiveView} from './liveview-fixture-loader.ts';
export async function dispatch(call:any){
 const started:string[]=[],results:Record<string,any>={},waiting=new Map<string,{resolve:(v:any)=>void,reject:(e:any)=>void}>();
 const old=process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;let port=6100;
 const ports:any={sandbox:{
  reserveLocalPort:async()=>port++,SandboxManager:class{
   async startBrowserSandbox(request:any){const id=request.projectRoot;started.push(id);return new Promise((resolve,reject)=>waiting.set(id,{resolve,reject}));}
   async stopContainer(){}
  }
 }};
 try{
  const {startLiveView}=await loadLiveView(ports);
  const phases:any[]=[];
  for(const step of call.steps){
   if('environment' in step){if(step.environment==null)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=step.environment;}
   if(step.launch){const id=step.launch;startLiveView({projectRoot:id}).then(s=>{results[id]={ok:s.containerName};},e=>{results[id]={error:e.message};});}
   if(step.release){const w=waiting.get(step.release);if(!w)throw Error('release of non-started fixture');waiting.delete(step.release);if(step.error)w.reject(Error(step.error));else w.resolve({containerName:step.release,vncPort:5900,novncPort:6080,novncUrl:'fixture'});}
   for(let i=0;i<40;i++)await Promise.resolve();
   phases.push({started:[...started],results:structuredClone(results)});
  }
  if(waiting.size)throw Error('fixture left active sandbox starts');return phases;
 }finally{if(old==null)delete process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS;else process.env.JAIT_MAX_CONTAINER_LIVE_VIEW_STARTS=old;}
}
