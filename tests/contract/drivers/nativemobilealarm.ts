/** Real tool factory with a deterministic clock and an isolated push-service port.
 * No phone, credentials, device registry, or external notification transport. */
import {createMobileAlarmScheduleTool} from '../../../packages/gateway/src/tools/mobile-tools.ts';
export async function dispatch(call:any) {
  const original=Date.now;
  const results=[];
  try {
    for(const test of call.cases) {
      Date.now=()=>test.now;
      const scheduled:any[]=[];
      const tool=createMobileAlarmScheduleTool({scheduleAlarm:async(user:string,alarm:any)=>{
        scheduled.push({user,alarm});
        if(test.reject) throw new Error(test.reject);
        return test.devices??1;
      }} as any);
      const {execute,...metadata}=tool;
      try {results.push({outcome:await execute(test.input,test.context),scheduled,metadata});}
      catch(error:any) {results.push({thrown:error.message,scheduled,metadata});}
    }
  } finally {Date.now=original;}
  return results;
}
