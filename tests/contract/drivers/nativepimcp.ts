import {provisionPiMcp,isPiBasedProvider,PI_BASED_PROVIDER_TYPES} from '../../../packages/gateway/src/providers/pi-mcp-provision.ts';
import {existsSync,readFileSync,mkdirSync,writeFileSync,statSync,readdirSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
function units(s:string){return Array.from({length:s.length},(_,i)=>s.charCodeAt(i));}
export async function dispatch(c:any){
 if(c.op==='nativepimcp.kinds')return {types:PI_BASED_PROVIDER_TYPES,values:c.values.map(isPiBasedProvider)};
 const savedTmp=process.env.TMPDIR,savedPlatform=Object.getOwnPropertyDescriptor(process,'platform')!,savedWarn=console.warn;
 const root=c.root;mkdirSync(root,{recursive:true});
 let fixture=root;
 if(c.badRoot){fixture=join(root,'not-directory');writeFileSync(fixture,'fixture');}
 process.env.TMPDIR=fixture;
 if(c.windows)Object.defineProperty(process,'platform',{...savedPlatform,value:'win32'});
 let warnings=0;console.warn=()=>{warnings++;};
 const normalize=(s:string,dir:string)=>{const escaped=dir.replace(/["\\$\x60]/g,(character)=>"\\"+character);return s.replaceAll(escaped,'<dir>').replaceAll(dir,'<dir>');};
 const entries=()=>readdirSync(root).filter(name=>name.startsWith('jait-pi-mcp-'));
 let p:ReturnType<typeof provisionPiMcp>=null;
 try{
  p=provisionPiMcp(c.provider??'pi',c.servers,{sessionId:c.session??'session',realPiCommand:c.command});
  if(!p)return {provision:null,warnings,entries:entries()};
  const wrapper=p.env.PI_ACP_PI_COMMAND!,dir=dirname(wrapper),config=join(dir,'mcp.json');
  const text=readFileSync(wrapper,'utf8');
  const v:any={env:{PI_ACP_PI_COMMAND:normalize(wrapper,dir)},config:JSON.parse(readFileSync(config,'utf8')),wrapper:units(normalize(text,dir)),privateDirectory:(statSync(dir).mode&0o777)===0o700,executable:c.windows?null:!!(statSync(wrapper).mode&0o100)};
  if(c.execute){
   const child=spawnSync(wrapper,c.args??[],{encoding:'utf8',env:{...process.env,JAIT_PI_MARKER:'expanded'}});
   v.execution={status:child.status,output:child.status===0?JSON.parse(child.stdout).map((s:string)=>normalize(s,dir)):child.stdout};
  }
  p.cleanup();p.cleanup();v.removed=!existsSync(dir);
  return {provision:v,warnings,entries:entries()};
 }finally{p?.cleanup();if(savedTmp===undefined)delete process.env.TMPDIR;else process.env.TMPDIR=savedTmp;Object.defineProperty(process,'platform',savedPlatform);console.warn=savedWarn;}
}
