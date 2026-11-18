/** Actual resolver source; desktop constructors are replaced at their import seam.
 * The sandbox manager and factory traces are scripts, never Docker/SSH execution. */
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url)).replace(/\/+$/,'');
export async function dispatch(call:any){
 const dir=root+'/.jait/artifacts/gateway-rust/os-resolver/reference';mkdirSync(dir,{recursive:true});
 let source=readFileSync(root+'/packages/gateway/src/os-control/resolver.ts','utf8');
 for(const statement of ['import { LinuxDesktopOsControlDriver } from "./linux-desktop-driver.js";','import { WindowsOsControlDriver } from "./windows-driver.js";']){
  if(source.split(statement).length!==2)throw Error('resolver dependency seam changed');source=source.replace(statement,'');
 }
 const prefix=`export const factories:any[]=[];export let failure:any;export let managerRef:any;
 export function reset(manager:any,error:any){factories.length=0;managerRef=manager;failure=error;}
 class LinuxDesktopOsControlDriver {__fixture:any;constructor(manager:any,name:string){const event={factory:'linux',name,managerIdentity:manager===managerRef};factories.push(event);if(failure!==undefined)throw Error(failure);this.__fixture={...event,index:factories.length};}}
 class WindowsOsControlDriver {__fixture:any;constructor(name:string,username:string,password?:string){const event={factory:'windows',name,username,...(password===undefined?{}:{password})};factories.push(event);if(failure!==undefined)throw Error(failure);this.__fixture={...event,index:factories.length};}}
 `;
 writeFileSync(dir+'/resolver.ts',prefix+source);
 const loaded=await import(pathToFileURL(dir+'/resolver.ts').href);
 let step:any={};const events:any[]=[];
 const manager:any={listRunningOsSandboxes:async()=>{events.push('list');if('error'in step){if(step.errorKind==='thrown')throw step.error;throw Error(step.error);}return step.infos??call.infos??[];}};
 loaded.reset(manager,call.factoryError);
 const resolver=loaded.createOsControlResolver(manager,call.windowsSsh??{});const results=[];
 for(step of call.steps){try{if(step.op==='list')results.push({connections:await resolver.listSandboxes()});else{const binding=await resolver.resolve(step.name);results.push({binding:{containerName:binding.containerName,type:binding.type,driver:binding.driver.__fixture}});}}catch(error){results.push(error instanceof Error?{error:{name:error.name,message:error.message}}:{thrown:error});}}
 return {results,events,factories:loaded.factories};
}
