/** Actual tool factory with the read-only service boundary isolated. */
import {createSessionSqlTool} from '../../../packages/gateway/src/tools/session-sql-tools.ts';
export async function dispatch(call:any) {
  return await Promise.all(call.cases.map(async(test:any)=>{
    const requests:any[]=[];
    function run(request:any) {requests.push(request);if(test.thrown)throw new Error(test.thrown);return structuredClone(test.response);}
    const tool=createSessionSqlTool({schema:()=>run({mode:'schema'}),query:(input:any)=>run({mode:'query',...input})} as any);
    const {execute,...metadata}=tool;
    try {return {outcome:await execute(test.input,{} as any),requests,metadata};}
    catch(error:any) {return {thrown:error.message,requests,metadata};}
  }));
}
