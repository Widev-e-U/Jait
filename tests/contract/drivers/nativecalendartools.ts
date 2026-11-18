export async function dispatch(call:any) {
 const {createCalendarTools}=await import('../../../packages/gateway/src/tools/calendar-tools.ts');
 const calls:any[]=[];
 let active:any;
 const invoke=(method:string,userId:any,accountId:any,options?:any)=>{
  calls.push({method,userId,...(accountId!==undefined?{accountId}:{}),...(options!==undefined?{options}:{})});
  if(active.error!==undefined)return Promise.reject(new Error(active.error));
  if(active.nonError)return Promise.reject('failure');
  return Promise.resolve(active.result);
 };
 const tools=createCalendarTools({listCalendars:(u:any,a:any)=>invoke('listCalendars',u,a),listEvents:(u:any,a:any,o:any)=>invoke('listEvents',u,a,o)} as any);
 if(call.op==='nativecalendartools.metadata')return tools.map(({execute,...definition})=>definition);
 const results=[];
 for(active of call.steps)results.push(await tools.find(t=>t.name===active.name)!.execute(active.input,{userId:active.user} as any));
 return JSON.parse(JSON.stringify({results,calls}));
}
