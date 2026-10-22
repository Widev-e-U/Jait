/** Real remote facade and Buffer; only the authorized RPC transport is scripted. */
import {RemoteFileSystemSurface,RemoteFileSystemSurfaceFactory} from '../../../packages/gateway/src/surfaces/remote-filesystem.ts';
function pack(v:any):any{return v===undefined?{undefined:true}:v instanceof Uint8Array?{buffer:[...v]}:{value:v};}
function failure(e:any){return e instanceof Error?{name:e.name,message:e.message}:{thrown:e};}
export async function dispatch(call:any){
 if(call.op==='nativeremotefs.decode')return call.inputs.map((s:string)=>[...Buffer.from(s,'base64')]);
 const results=[];
 for(const test of call.cases){
  const events:any[]=[],outcomes:any[]=[],files=new Map<string,string>(Object.entries(test.files??{}));let step:any={};
  const transport:any={proxyFsOp:async(node:any,operation:string,input:any)=>{
   events.push({node,operation,input});
   if(step.fail===operation){if('thrown'in step)throw step.thrown;throw new Error(step.error??'RPC failure');}
   if('reply'in step)return step.reply;
   switch(operation){
    case 'read':if(!files.has(input.path))throw new Error('File missing');return {content:files.get(input.path)};
    case 'readBinary':if('encoded'in step)return {content:step.encoded};if(!files.has(input.path))throw new Error('File missing');return {content:Buffer.from(files.get(input.path)!).toString('base64')};
    case 'write':files.set(input.path,input.content);return {ok:true};
    case 'exists':return files.has(input.path);
    case 'list':return ['second','first/'];
    case 'stat':return {size:7,isDirectory:false,modified:'2026-01-02T03:04:05.000Z'};
    default:throw new Error('Unsupported fixture RPC');
   }
  }};
  const surface=test.factory?new RemoteFileSystemSurfaceFactory(transport).create('remote-fixture'):new RemoteFileSystemSurface('remote-fixture',transport);
  surface.onOutput=data=>{events.push({output:data});if(step.outputError)throw new Error(step.outputError);};
  surface.onStateChange=state=>{events.push({state});if(step.stateError)throw new Error(step.stateError);};
  for(step of test.ops){try{
   let value:any;
   switch(step.op){
    case 'start':{const Original=globalThis.Date;globalThis.Date=class extends Original{constructor(...args:any[]){super(...(args.length?args:[1790000000000])as [any]);}}as any;try{value=await surface.start({sessionId:'fixture-session',projectRoot:'E:\\Project',nodeId:'fixture-node',...step.input});}finally{globalThis.Date=Original;}break;}
    case 'stop':value=await surface.stop(step.input);break;
    case 'state':value={id:surface.id,type:surface.type,state:surface.state,sessionId:surface.sessionId,nodeId:surface.nodeId};break;
    case 'snapshot':value=surface.snapshot();break;
    case 'read':value=await surface.read(step.path);break;
    case 'readBinary':value=await surface.readBinary(step.path);break;
    case 'write':value=await surface.write(step.path,step.content);break;
    case 'patch':value=await surface.patch(step.path,step.search,step.replace);break;
    case 'exists':value=await surface.exists(step.path);break;
    case 'list':value=await surface.list(step.path);break;
    case 'stat':value=await surface.statFile(step.path);break;
    case 'allowed':value=surface.isPathAllowed(step.path);break;
    case 'restore':value=await surface.restore(step.path);break;
    case 'getBackup':value=surface.getBackup(step.path);break;
    case 'hasBackup':value=surface.hasBackup(step.path);break;
    case 'clearBackup':value=surface.clearBackup(step.path);break;
    case 'saveExternalBackup':value=await surface.saveExternalBackup(step.path);break;
    default:throw new Error('Unsupported fixture step');
   }
   outcomes.push(pack(value));
  }catch(e){outcomes.push({error:failure(e)});}}
  results.push({outcomes,events,files:Object.fromEntries(files)});
 }
 return results;
}
