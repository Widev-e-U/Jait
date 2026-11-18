export async function dispatch(call:any) {
 const {DiskSpaceWatchdog,isAgentJob}=await import('../../../packages/gateway/src/services/disk-space-watchdog.ts');
 if(call.op==='nativewatchdog.jobs')return call.jobs.map(isAgentJob);
 const {statfs}=await import('node:fs/promises');
 if(call.op==='nativewatchdog.stat') {
  const d=await statfs(call.path);return {blocks:d.blocks,bavail:d.bavail,files:d.files,ffree:d.ffree};
 }
 const RealDate=Date;globalThis.Date=class extends RealDate{constructor(...args:any[]){super(...(args.length?args:[call.now])as[any]);}static now(){return call.now;}}as DateConstructor;
 let jobs=structuredClone(call.jobs),active:any;
 const calls:any[]=[];
 const backend={
  list(){calls.push({op:'list'});if(active.listError)throw new Error(active.listError);return structuredClone(jobs);},
  update(id:any,patch:any){calls.push({op:'update',id,patch});if(active.updateError)throw new Error(active.updateError);const j=jobs.find((j:any)=>j.id===id);if(j)Object.assign(j,patch);}
 };
 const notifications:any={};
 for(const level of ['warning','error'])notifications[level]=(title:any,message:any)=>{calls.push({op:'notify',level,title,message});if(active.notifyError&&title===active.notifyError.title)throw new Error(active.notifyError.message);};
 const probe=async(path:string)=>{
  calls.push({op:'probe',path});const d=active.disks[path];
  if(d?.error){const e:any=new Error(d.error);e.code=d.code;throw e;}
  if(!d)throw new Error('missing fixture sample');
  return Object.fromEntries(Object.entries(d).map(([k,v])=>[k,typeof v==='string'?Number(v):v]));
 };
 const watchdog=new DiskSpaceWatchdog(backend as any,notifications,probe as any,call.paths);
 const results=[];
 try {
  for(active of call.checks){
   if(active.replaceJobs)jobs=structuredClone(active.replaceJobs);
   try{await watchdog.check();results.push(null);}catch(e:any){results.push({error:e.message});}
  }
  return {results,calls,jobs};
 }finally{globalThis.Date=RealDate;}
}
