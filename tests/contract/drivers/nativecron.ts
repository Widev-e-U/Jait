/** Actual cron factories; only the scheduler's typed service boundary is isolated. */
import {createCronAddTool,createCronListTool,createCronRemoveTool,createCronUpdateTool} from '../../../packages/gateway/src/tools/cron-tools.ts';
const factories:any={add:createCronAddTool,list:createCronListTool,remove:createCronRemoveTool,update:createCronUpdateTool};
export async function dispatch(call:any) {
  return await Promise.all(call.cases.map(async(test:any)=>{
    const requests:any[]=[];
    const scheduler:any={};
    for(const op of ['create','list','remove','update']) scheduler[op]=(...args:any[])=>{
      requests.push({op,args});
      if(test.thrown)throw new Error(test.thrown);
      return structuredClone(test.response);
    };
    const tool=factories[test.operation](scheduler);
    const {execute,...metadata}=tool;
    try{return {outcome:await execute(test.input,test.context),requests,metadata};}
    catch(error:any){return {thrown:error.message,requests,metadata};}
  }));
}
