/** Calls the actual production export. Exception wording is engine-specific;
 * compare exception class, complete results, mutation, and own property keys. */
import {validateToolInput} from '../../../packages/gateway/src/tools/validate.ts';
export async function dispatch(call:any) {
  return call.cases.map((test:any)=>{
    const input=test.inputJson===undefined?structuredClone(test.input):JSON.parse(test.inputJson);
    for(const item of test.nonfinite??[]) input[item.key]=item.value==='NaN'?NaN:item.value==='-Infinity'?-Infinity:Infinity;
    let result:any;
    try {result={outcomeJson:JSON.stringify(validateToolInput(test.schema,input))};}
    catch(error:any) {result={thrown:{name:error.name}};}
    return {...result,afterJson:JSON.stringify(input),keysJson:JSON.stringify(input&&typeof input==='object'?Object.keys(input):null)};
  });
}
