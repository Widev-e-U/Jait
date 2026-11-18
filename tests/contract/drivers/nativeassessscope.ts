/** Pure production scope validation; no AssessmentService execution or network. */
import {validateScope} from '../../../packages/gateway/src/security/assessment.ts';
export async function dispatch(call:any) {
  return call.cases.map((test:any)=>{
    try{return {scope:validateScope(test.input,call.now)};}
    catch(error:any){return {error:error.message};}
  });
}
