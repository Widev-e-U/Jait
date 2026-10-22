/** Actual production diagnostic; protocol carries UTF-16 code units losslessly. */
import {describeUpdateFailure} from '../../../packages/gateway/src/routes/update-failure.ts';
const units=(s:string)=>Array.from({length:s.length},(_,i)=>s.charCodeAt(i));
export async function dispatch(call:any) {
 const raw=call.units?String.fromCharCode(...call.units):call.raw;
 let value:any=raw;
 if(call.kind==='error')value=Object.assign(new Error(raw),{code:call.code});
 else if(call.kind==='object')value={message:raw,code:call.code};
 else if(call.kind==='undefined')value=undefined;
 else if(call.kind==='null')value=null;
 else if(call.kind==='array')value=call.value;
 const result=describeUpdateFailure(value);
 return {code:result.code,hint:result.hint,detailUnits:units(result.detail)};
}
