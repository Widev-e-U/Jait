/** Actual pure channel assistant functions. Time and timezone inputs are deterministic. */
import {CHANNEL_ACTIVATED_TOOLS,CHANNEL_ASSISTANT_NOTE,formatLocalTime,buildChannelContextBlock,hostTimeZone} from '../../../packages/gateway/src/channels/assistant.ts';
export async function dispatch(call:any){
 if(call.op.endsWith('.constants'))return {tools:CHANNEL_ACTIVATED_TOOLS,note:CHANNEL_ASSISTANT_NOTE};
 if(call.op.endsWith('.zones'))return Intl.supportedValuesOf('timeZone');
 if(call.op.endsWith('.host')){
  const Original=Intl.DateTimeFormat;
  try{
   (Intl as any).DateTimeFormat=function(){if(call.error)throw Error('fixture failure');return {resolvedOptions:()=>({timeZone:call.zone})};};
   return hostTimeZone();
  }finally{Intl.DateTimeFormat=Original;}
 }
 return call.rows.map((row:any)=>{
  const date=new Date(row.invalid?NaN:row.ms);
  try{return {ok:true,format:formatLocalTime(date,row.zone),context:buildChannelContextBlock({channelId:row.channelId??'fixture',channelLabel:row.channelLabel??'Fixture',conversationId:row.conversationId??'room',timeZone:row.zone,now:date,...(row.model===undefined?{}:{model:row.model})})};}
  catch(e){return {ok:false,name:e instanceof Error?e.name:'Thrown',message:e instanceof Error?e.message:String(e)};}
 });
}
