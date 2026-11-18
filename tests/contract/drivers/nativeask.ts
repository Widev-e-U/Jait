import {UserQuestionService} from '../../../packages/gateway/src/services/user-questions.ts';
import {createUserAskTool} from '../../../packages/gateway/src/tools/user-question-tools.ts';
export async function dispatch(call:any) {
  if(call.op==='nativeask.metadata'){const {execute,...metadata}=createUserAskTool(new UserQuestionService());return metadata;}
  const RealDate=Date;
  globalThis.Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[call.now]) as [any]);}
    static now(){return new RealDate(call.now).getTime();}
  } as DateConstructor;
  try {
    const events:any[]=[];
    const service=new UserQuestionService({onRequest:request=>events.push({kind:'request',request:structuredClone(request)}),onResolved:request=>events.push({kind:'resolved',request:structuredClone(request)})});
    let settled=false;let result:any=null;
    void createUserAskTool(service).execute(call.input,call.context).then(value=>{settled=true;result=value;});
    await Promise.resolve();
    const actions=[];
    const id=events[0]?.request.id??'missing';
    for(const action of call.actions??[]){
      if(action.op==='list')actions.push(service.listPending(action.session,action.user));
      if(action.op==='submit')actions.push(service.submit(id,action.value,action.user));
      if(action.op==='cancel')actions.push(service.cancel(id,action.user));
      await Promise.resolve();
    }
    await Promise.resolve();
    return {settled,result,actions,events,pending:service.listPending()};
  }finally{globalThis.Date=RealDate;}
}
