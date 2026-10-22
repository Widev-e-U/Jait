/** Actual resolver, classes and registry; only fixture state and clocks are supplied. */
import {getFs,resolveProjectRoot,isGatewayLocalPathOutsideProject} from '../../../packages/gateway/src/tools/core/get-fs.ts';
import {SurfaceRegistry} from '../../../packages/gateway/src/surfaces/registry.ts';
import {FileSystemSurface,FileSystemSurfaceFactory} from '../../../packages/gateway/src/surfaces/filesystem.ts';
import {RemoteFileSystemSurface} from '../../../packages/gateway/src/surfaces/remote-filesystem.ts';
import {mkdir,writeFile} from 'node:fs/promises';import {resolve,dirname} from 'node:path';
export async function dispatch(call:any){const results=[];const Original=globalThis.Date;
 try{globalThis.Date=class extends Original{constructor(...args:any[]){super(...(args.length?args:[1790000000000])as [any]);}}as any;
 for(const test of call.cases){
  await mkdir(test.root,{recursive:true});
  for(const item of test.setup??[]){const path=resolve(test.root,item.path);if(!path.startsWith(dirname(test.root)+'/'))throw Error('fixture escapes owner');await mkdir(dirname(path),{recursive:true});if(item.directory)await mkdir(path,{recursive:true});else await writeFile(path,item.content??'fixture');}
  const registry=new SurfaceRegistry(),events:any[]=[],outcomes=[];let step:any={};
  const factory=new FileSystemSurfaceFactory();if(!test.noFactory)registry.register({type:'filesystem',create(id:string){if(test.factoryError)throw Error(test.factoryError);return factory.create(id);}});
  for(const item of test.surfaces??[]){let surface:any;
   if(item.kind==='remote')surface=new RemoteFileSystemSurface(item.id,{}as any);
   else if(item.kind==='other')surface={id:item.id,type:'browser',state:item.state??'running',sessionId:item.session??'s',snapshot:()=>({id:item.id,type:'browser',state:item.state??'running',sessionId:item.session??'s',metadata:{projectRoot:item.root??null}})};
   else surface=new FileSystemSurface(item.id);
   if(item.kind!=='other'&&item.state!=='idle'){await surface.start({sessionId:item.session??'s',projectRoot:item.root,nodeId:'node'});if(item.state==='stopped')await surface.stop();}
   registry.registerInstance(item.id,surface);
  }
  registry.onSurfaceStarted=(id,surface)=>{events.push({id,snapshot:surface.snapshot()});if(step.hookError)throw Error(step.hookError);};
  for(step of test.ops){try{let value:any;const context={sessionId:step.session??'s',projectRoot:step.projectRoot??test.root,userId:'owner'}as any;
   if(step.op==='get'){const s=await getFs(registry,context,step.target);value=s.snapshot();}
   else if(step.op==='root')value=resolveProjectRoot(registry,step.session??'s',step.fallback);
   else if(step.op==='local')value=isGatewayLocalPathOutsideProject(step.target,step.projectRoot);
   else if(step.op==='stop')value=await registry.stopSurface(step.id);
   else throw Error('Unknown fixture step');
   outcomes.push({value});
  }catch(e){outcomes.push({error:e instanceof Error?e.message:String(e)});}}
  results.push({outcomes,events,surfaces:registry.listSnapshots()});
 }
 return results;
 }finally{globalThis.Date=Original;}
}
