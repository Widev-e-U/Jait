export async function dispatch(call:any) {
 if(call.op==='nativeutility.metadata'){
  const {createTodoTool}=await import('../../../packages/gateway/src/tools/core/todo.ts');
  const {jaitLinkTool}=await import('../../../packages/gateway/src/tools/link-tools.ts');
  return JSON.parse(JSON.stringify([createTodoTool(),jaitLinkTool]));
 }
 if(call.op==='nativeutility.links'){
  const {jaitLinkTool}=await import('../../../packages/gateway/src/tools/link-tools.ts');
  const {parseJaitRenderedLink,safeNotificationLink}=await import('../../../packages/shared/src/index.ts');
  const values=[];
  for(const v of call.values){
   let result;try{result=await jaitLinkTool.execute(v,{}as any);}catch{result={error:true};}
   values.push({safe:safeNotificationLink(v?.href),parsed:parseJaitRenderedLink(v),result});
  }
  return values;
 }
 if(call.op==='nativeutility.todos'){
  const m=await import('../../../packages/gateway/src/tools/core/todo.ts');
  const tool=m.createTodoTool(),results:any[]=[],aliases:any={},sessions=new Set<string>();
  try{
   for(const s of call.steps) {
    const session=s.session??'s';sessions.add(session);let v:any=null;
    if(s.op==='execute')v=await tool.execute(s.input,{sessionId:session}as any);
    if(s.op==='get')v=m.getSessionTodos(session);
    if(s.op==='clear')m.clearSessionTodos(session);
    if(s.op==='observe')v=aliases[s.alias];
    if(s.op==='append')m.getSessionTodos(session).push(s.item);
    if(s.op==='mutate')Object.assign(m.getSessionTodos(session)[s.index],s.patch);
    if(s.op==='inputMutate')Object.assign(aliases[s.alias][s.index],s.patch);
    if(s.retain)aliases[s.retain]=v;
    results.push(v);
   }
   return results;
  }finally{for(const session of sessions)m.clearSessionTodos(session);}
 }
 throw new Error('unknown operation');
}
