/** Runs the real tool adapter; only the underlying maintenance runner is controlled. */
export async function dispatch(call:any) {
  const {createMaintenanceRunTool}=await import('../../../packages/gateway/src/tools/maintenance-tools.ts');
  if(call.op==='nativemaintenancetool.metadata') return JSON.parse(JSON.stringify(createMaintenanceRunTool({} as any)));
  const events:any[]=[];
  const fail=(failure:any)=>{ if(failure?.type==='error') throw new Error(failure.message); if(failure) throw failure.value; };
  const service={
    async runForRepo(repoId:any,jobId:any) {events.push({service:{repoId,jobId}});fail(call.backendFailure);return structuredClone(call.result);},
    async runAll(jobId:any) {events.push({service:{jobId}});fail(call.backendFailure);return structuredClone(call.results??[]);}
  };
  const notifications=call.notifications?{
    success(title:any,body:any,link?:any){events.push({notification:{level:'success',title,body,...(link===undefined?{}:{link})}});fail(call.notificationFailure);},
    warning(title:any,body:any,link?:any){events.push({notification:{level:'warning',title,body,...(link===undefined?{}:{link})}});fail(call.notificationFailure);}
  }:undefined;
  const original=Date.now;
  Date.now=()=>call.now??1740000000000;
  try{
    const tool=createMaintenanceRunTool(service as any,notifications as any);
    const result=await tool.execute(call.input,{actionId:call.actionId} as any);
    return {result,events};
  }finally{Date.now=original;}
}
