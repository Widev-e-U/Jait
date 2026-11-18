/** Real input/notification services, isolated data and a fixed wall clock. */
import { UserQuestionService } from '../../../packages/gateway/src/services/user-questions.ts';
import { SecretInputService } from '../../../packages/gateway/src/services/secret-input.ts';
export async function dispatch(call:any) {
  const RealDate=Date;
  globalThis.Date=class extends RealDate {
    constructor(...args:any[]){super(...(args.length?args:[call.now]) as [any]);}
    static now(){return new RealDate(call.now).getTime();}
  } as DateConstructor;
  try {
    if(call.op==='nativeinput.notifications') {
      const {ChatNotificationsService}=await import('../../../packages/gateway/src/services/chat-notifications.ts');
      const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
      const {SessionStateService}=await import('../../../packages/gateway/src/services/session-state.ts');
      const {db,sqlite}=await openDatabase(':memory:');
      const log=console.log;console.log=(...args)=>console.error(...args);
      try {
        migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
        const service=new ChatNotificationsService(call.storage?db:undefined);
        const results=[];
        for(const step of call.steps){
          try{
            if(step.op==='set'){service.set(step.user,step.state);results.push(null);}
            else if(step.op==='get')results.push(service.get(step.id));
            else if(step.op==='list')results.push(service.list(step.user));
            else if(step.op==='raw'){new SessionStateService(db).set(step.id,{'notification.completion':step.value});results.push(null);}
            else if(step.op==='bulk'){for(let i=0;i<step.count;i++)service.set('owner',{id:'n'+i,sessionId:'s'+i,replaceId:'chat-complete:s'+i,read:false});results.push(null);}
            else throw new Error('unknown step');
          }catch{results.push({error:true});}
        }
        return {results,rows:sqlite.query('SELECT session_id,key,value,updated_at FROM session_state ORDER BY rowid').all()};
      }finally{sqlite.close();console.log=log;}
    }
    const events:any[]=[];const resolved:any={};const aliases=new Map<string,string>();
    const observe=(kind:string)=>(request:any)=>events.push({kind,request:structuredClone(request)});
    const service:any=call.secret
      ?new SecretInputService({defaultTimeoutMs:call.defaultTimeoutMs,onRequest:observe('request'),onResolved:observe('resolved')})
      :new UserQuestionService({onRequest:observe('request'),onResolved:observe('resolved')});
    const results:any[]=[];
    for(const step of call.steps){
      if(step.op==='ask'){
        const pending=call.secret?service.requestSecret(step.input):service.ask(step.input);
        const request=events.at(-1).request;aliases.set(step.alias,request.id);
        pending.then((value:any)=>{resolved[step.alias]=value;});
        results.push(null);
      }else if(step.op==='list')results.push(service.listPending(step.session,step.user));
      else if(step.op==='wait'){await new Promise(resolve=>setTimeout(resolve,step.ms));results.push(null);}
      else if(step.op==='submit')results.push(service.submit(aliases.get(step.alias)??step.alias,step.value,step.user));
      else if(step.op==='cancel')results.push(service.cancel(aliases.get(step.alias)??step.alias,step.user));
      else throw new Error('unknown step');
      await Promise.resolve();
    }
    return {results,events,resolved};
  }finally{globalThis.Date=RealDate;}
}
