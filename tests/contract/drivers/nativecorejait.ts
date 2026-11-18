/** Actual core platform tool; only its typed dependency ports and clock are scripted. */
import {createJaitTool} from '../../../packages/gateway/src/tools/core/jait.ts';
export async function dispatch(call:any){
 if(call.op==='nativecorejait.metadata'){const {execute,...rest}=createJaitTool({});return rest;}
 const Original=globalThis.Date;const now=1790000000123;
 try{globalThis.Date=class extends Original{constructor(...args:any[]){super(...args as [any]);}static now(){return now;}}as any;
 const out=[];
 for(const test of call.cases){let step:any={};const events:any[]=[],results=[];
  function port(service:string,method:string,args:any[]){
   events.push({service,method,args});const override=step.replies?.[service+'.'+method];
   if(override){if('error'in override)throw Error(override.error);if('thrown'in override)throw override.thrown;if(override.undefined)return undefined;if('value'in override)return override.value;}
   switch(service+'.'+method){
    case 'memory.save':return {id:'mem-saved',scope:args[0].scope};
    case 'memory.search':return test.memories??[];
    case 'memory.forget':return step.memoryRemoved??true;
    case 'reminders.create':return {id:'rem-saved',...args[0]};
    case 'reminders.list':return test.reminders??[];
    case 'reminders.update':return step.missingReminder?undefined:{id:args[0],...args[1]};
    case 'reminders.delete':return step.reminderRemoved??false;
    case 'scheduler.create':return {id:'job-created',...args[0]};
    case 'scheduler.list':return test.jobs??[];
    case 'scheduler.update':return step.missingJob?undefined:{id:args[0],...args[1]};
    case 'scheduler.remove':return step.jobRemoved??true;
    case 'sessions.list':return test.sessions??[];
    case 'surfaces.listSurfaces':return test.surfaces??[];
    case 'hooks.registeredEventTypes':return test.hookEvents??[];
    case 'hooks.listenerCount':return test.listeners??0;
    default:throw Error('Unknown fixture port');
   }
  }
  const deps:any={startedAt:test.startedAt};
  const methods:any={memory:['save','search','forget'],reminders:['create','list','update','delete'],scheduler:['create','list','update','remove'],sessions:['list'],surfaces:['listSurfaces'],hooks:['registeredEventTypes','listenerCount']};
  const names:any={memory:'memoryService',reminders:'reminderService',scheduler:'scheduler',sessions:'sessionService',surfaces:'surfaceRegistry',hooks:'hooks'};
  for(const service of test.available??[])deps[names[service]]=Object.fromEntries(methods[service].map((method:string)=>[method,(...args:any[])=>port(service,method,args)]));
  if('devices'in test)deps.ws={clientCount:test.devices};
  const tool=createJaitTool(deps);
  for(step of test.ops){const context:any={sessionId:'session',actionId:'action',projectRoot:'ignored-context-root',...test.context};if(!test.noUser)context.userId=test.context?.userId??'owner';const r=await tool.execute(step.input,context);const {message,...rest}=r;results.push({...rest,messageUnits:Array.from({length:message.length},(_,i)=>message.charCodeAt(i))});}
  out.push({results,events});
 }
 return out;
 }finally{globalThis.Date=Original;}
}
