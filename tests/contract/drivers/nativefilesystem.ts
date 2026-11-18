/** Actual filesystem surface operating only in owned project-local fixtures. */
import {FileSystemSurface,FileSystemSurfaceFactory} from '../../../packages/gateway/src/surfaces/filesystem.ts';
import {fileURLToPath} from 'node:url';import {resolve,join,dirname,relative} from 'node:path';
import {mkdir,rm,writeFile,readdir,readFile,symlink,readlink,lstat,utimes} from 'node:fs/promises';
const base=fileURLToPath(new URL('../../../.jait/artifacts/gateway-rust/filesystem/contracts',import.meta.url));
function owned(root:string){const parent=dirname(root);if(dirname(parent)!==resolve(base)||! /^[0-9a-f-]{36}$/.test(parent.slice(parent.lastIndexOf('/')+1))||root!==join(parent,'work'))throw new Error('fixture root outside owned filesystem contracts');return parent;}
async function seed(root:string,test:any){const outer=owned(root);await rm(outer,{recursive:true,force:true});await mkdir(root,{recursive:true});for(const item of test.setup??[]){const path=resolve(root,item.path);if(path!==outer&&!path.startsWith(outer+'/'))throw new Error('seed escapes owned fixture');await mkdir(dirname(path),{recursive:true});if(item.type==='directory')await mkdir(path,{recursive:true});else if(item.type==='symlink')await symlink(item.target,path);else{await writeFile(path,item.bytes?Buffer.from(item.bytes):item.content??'');await utimes(path,new Date(1_600_000_000_000),new Date(1_600_000_000_000));}}}
async function tree(path:string,root=path):Promise<any[]>{let info;try{info=await lstat(path);}catch{return [];}const rel=relative(root,path)||'.';if(info.isSymbolicLink())return [{path:rel,type:'symlink',target:await readlink(path)}];if(!info.isDirectory())return [{path:rel,type:'file',bytes:[...await readFile(path)]}];let result=[{path:rel,type:'directory'}];for(const entry of (await readdir(path)).sort())result.push(...await tree(join(path,entry),root));return result;}
function packed(v:any):any{return v===undefined?{undefined:true}:Buffer.isBuffer(v)?{buffer:[...v]}:{value:v};}
function error(e:any):any{if(!(e instanceof Error))return {thrown:e};const o:any={name:e.name,message:e.message};for(const k of ['code','syscall','path','dest','boundary'])if(e[k]!==undefined)o[k]=e[k];return o;}
function stamp(v:any){if(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(v.modified)||!Number.isFinite(Date.parse(v.modified)))throw new Error('invalid stat ISO timestamp');return {...v,modified:'<mtime>'};}
export async function dispatch(call:any){const results=[];
 for(const test of call.cases){const root=resolve(test.root);await seed(root,test);const events:any[]=[];let surface:FileSystemSurface;const opts={...(test.guard??{})};if(opts.projectRoot===true)opts.projectRoot=join(root,'override');
  surface=test.factory?new FileSystemSurfaceFactory(opts).create('filesystem-fixture'):new FileSystemSurface('filesystem-fixture',opts);
  surface.onOutput=data=>{events.push({output:data});if(test.outputError)throw new Error(test.outputError);};surface.onStateChange=state=>{events.push({state});if(test.stateError)throw new Error(test.stateError);};
  const outcomes=[];
  for(const op of test.ops??[]){try{let value:any;switch(op.op){
   case 'start':{const RealDate=globalThis.Date;globalThis.Date=class extends RealDate{constructor(...args:any[]){if(args.length)super(...args as [any]);else super(1_790_000_000_000);}}as any;try{value=await surface.start({sessionId:'fixture-session',projectRoot:root,...op.input});}finally{globalThis.Date=RealDate;}break;}
   case 'stop':value=await surface.stop(op.input);break;
   case 'snapshot':value=surface.snapshot();break;
   case 'state':value={id:surface.id,type:surface.type,state:surface.state,sessionId:surface.sessionId};break;
   case 'read':value=await surface.read(op.path);break;
   case 'readBinary':value=await surface.readBinary(op.path);break;
   case 'write':value=await surface.write(op.path,op.content);break;
   case 'patch':value=await surface.patch(op.path,op.search,op.replace);break;
   case 'exists':value=await surface.exists(op.path);break;
   case 'list':value=await surface.list(op.path);break;
   case 'stat':value=stamp(await surface.statFile(op.path));break;
   case 'allowed':value=surface.isPathAllowed(op.path);break;
   case 'restore':value=await surface.restore(op.path);break;
   case 'hasBackup':value=surface.hasBackup(op.path);break;
   case 'getBackup':value=surface.getBackup(op.path);break;
   case 'clearBackup':value=surface.clearBackup(op.path);break;
   case 'saveExternalBackup':value=await surface.saveExternalBackup(op.path);break;
   case 'deleteFile':value=await surface.deleteFile(op.path);break;
   case 'deleteDirectory':value=await surface.deleteDirectory(op.path);break;
   case 'rename':value=await surface.renameFile(op.path,op.name);break;
   case 'move':value=await surface.moveFile(op.path,op.destination);break;
   case 'mkdir':value=await surface.createDirectory(op.path);break;
   case 'create':value=op.content===undefined?await surface.createFile(op.path):await surface.createFile(op.path,op.content);break;
   case 'copy':value=await surface.copyFile(op.path,op.destination);break;
   default:throw new Error('unsupported filesystem fixture operation');
  }outcomes.push(packed(value));}catch(e){outcomes.push({error:error(e)});}}
  results.push({outcomes,events,tree:await tree(owned(root))});
 }
 return results;
}
