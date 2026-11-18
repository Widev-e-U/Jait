import {ProviderSnapshotCache} from '../../../packages/gateway/src/providers/provider-snapshot.ts';
import {hasOpenCodeGoCredential,readOpenCodeGoCredential,setOpenCodeGoCredential} from '../../../packages/gateway/src/providers/opencode-credentials.ts';
import {mkdirSync,writeFileSync,readFileSync,existsSync,readdirSync,statSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
export async function dispatch(call:any){
 if(call.op==='nativeproviderhelpers.credentials'){
  const env={HOME:call.directory,...call.env};const path=join(env.XDG_DATA_HOME||join(env.HOME||call.directory,'.local/share'),'opencode/auth.json');
  const rows=[];
  for(const step of call.steps){
   let value:any=null;
   try{
    if(step.op==='raw'){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(step.hex??Buffer.from(step.raw).toString('hex'),'hex'));}
    else if(step.op==='directory'){mkdirSync(dirname(path),{recursive:true});if(existsSync(path))rmSync(path,{force:true});mkdirSync(path);}
    else if(step.op==='has')value=hasOpenCodeGoCredential(env);
    else if(step.op==='read')value=readOpenCodeGoCredential(env);
    else if(step.op==='set')setOpenCodeGoCredential(step.key,env);
   }catch(e){value={error:(e as Error).message.startsWith('OpenCode credentials could not be read.')?'preserved':'io'};}
   const file=existsSync(path)&&statSync(path).isFile();
   rows.push({value,raw:file?readFileSync(path,'utf8'):null,mode:file?(statSync(path).mode&0o777):null,
     leftovers:existsSync(dirname(path))?readdirSync(dirname(path)).filter(x=>x.endsWith('.tmp')):[]});
  }
  return rows;
 }
 const realNow=Date.now;let now=call.now??1000;Date.now=()=>now;
 const counts:any={};const pending:any={};const done:any={};let listed=0;
 let providers:any[]=call.providers.map((p:any)=>({id:p.id,providerType:p.providerType,info:p.info,
  checkAvailability:()=>{counts[p.id+':availability']=(counts[p.id+':availability']??0)+1;return p.delay?new Promise((resolve,reject)=>{(pending[p.id]??=[]).push({resolve,reject});}):p.availabilityError?Promise.reject(new Error('probe failure')):Promise.resolve(p.installed??true);},
  ...(p.hasAuth?{getAuthStatus:async()=>{counts[p.id+':auth']=(counts[p.id+':auth']??0)+1;if(p.authError)throw new Error('auth failure');return p.auth;}}:{})}));
 const cache=new ProviderSnapshotCache({list:()=>{listed++;if(call.registryError)throw new Error('registry failed');return providers;}} as any);
 const waiting:any={};const rows=[];
 const flush=async()=>{for(let i=0;i<30;i++)await Promise.resolve();};
 try{
  for(const step of call.steps){
   if(step.op==='get'){waiting[step.key]=cache.get(step.force??false).then(value=>done[step.key]=value,e=>done[step.key]={error:true});}
   else if(step.op==='warm')cache.warm();
   else if(step.op==='invalidate')cache.invalidate();
   else if(step.op==='time')now=step.now;
   else if(step.op==='info')providers.find(p=>p.id===step.id).info=step.info;
   else if(step.op==='release'){const entry=pending[step.id]?.shift();if(!entry)throw new Error('missing probe');if(step.error)entry.reject(new Error('availability failed'));else entry.resolve(step.value??true);}
   else if(step.op==='empty')providers=[];
   await flush();
   rows.push({done:structuredClone(done),counts:{...counts},listed});
  }
  return rows;
 }finally{Date.now=realNow;}
}
