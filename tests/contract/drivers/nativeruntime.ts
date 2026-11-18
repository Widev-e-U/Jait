export async function dispatch(call:any) {
  if(call.op==='nativeruntime.metadata'){
    const a=await import('../../../packages/gateway/src/tools/agent-message-tool.ts');
    const g=await import('../../../packages/gateway/src/tools/gateway-tools.ts');
    const e=await import('../../../packages/gateway/src/tools/project-editor-tools.ts');
    const v=await import('../../../packages/gateway/src/tools/voice-tools.ts');
    return JSON.parse(JSON.stringify([a.createAgentMessageTool(),g.createGatewayStatusTool({} as any),e.createProjectEditorOpenTool(),v.createVoiceSpeakTool({} as any)]));
  }
  if(call.op==='nativeruntime.names')return (await import('../../../packages/gateway/src/tools/tool-names.ts')).ToolName;
  if(call.op==='nativeruntime.intents'){
    const m=await import('../../../packages/gateway/src/tools/agent-communication.ts');
    return {performatives:m.PERFORMATIVES,values:call.values.map((s:string)=>({parsed:m.parsePerformative(s),stripped:m.stripPerformativeTag(s)})),
      kinds:call.kinds.map((s:any)=>({successful:m.isSuccessfulPerformative(s),description:m.describePerformative(s)}))};
  }
  if(call.op==='nativeruntime.editor'||call.op==='nativeruntime.voice'){
    const events:any[]=[];
    const ws=call.ws?{sendUICommand(command:any,session:any){events.push({command,session});if(call.error)throw new Error('sink failed');}}:undefined;
    const voice={speak(request:any){events.push(request);if(call.error)throw new Error('speak failed');return call.spoken;}};
    const tool=call.op.endsWith('editor')?(await import('../../../packages/gateway/src/tools/project-editor-tools.ts')).createProjectEditorOpenTool(ws as any):
      (await import('../../../packages/gateway/src/tools/voice-tools.ts')).createVoiceSpeakTool(voice as any);
    let result;try{result=await tool.execute(call.input,call.context??{});}catch{result={error:true};}
    return {result,events};
  }
  if(call.op==='nativeruntime.status'){
    const {createGatewayStatusTool}=await import('../../../packages/gateway/src/tools/gateway-tools.ts');
    const events:any[]=[];
    const record=(name:string,value:any)=>{events.push(name);if(call.error===name)throw new Error('source failed');return value;};
    const now=Date.now;Date.now=()=>record('now',call.now);
    try {
      const deps:any={
        sessionService:{list(status:string){events.push({status});return record('sessions',call.sessions??[]);}},
        surfaceRegistry:{listSurfaces(){return record('surfaces',call.surfaces??[]);}},
        ws:{get clientCount(){return record('devices',call.devices??0);}},startedAt:call.startedAt,
      };
      if(call.jobs!==undefined)deps.scheduler={list(){return record('jobs',call.jobs);}};
      if(call.hooks!==undefined)deps.hooks={registeredEventTypes(){return record('types',call.hooks.types);},listenerCount(){return record('listeners',call.hooks.listeners);}};
      let result;try{result=await createGatewayStatusTool(deps).execute({},{} as any);}catch{result={error:true};}
      return {result,events};
    }finally{Date.now=now;}
  }
  if(call.op==='nativeruntime.swarm'){
    const {createAgentMessageTool}=await import('../../../packages/gateway/src/tools/agent-message-tool.ts');
    const m=await import('../../../packages/gateway/src/tools/swarm-mailbox.ts');
    const tool=createAgentMessageTool(),results:any[]=[],aliases:any={},rounds=new Set<string>();
    let current=call.now;const now=Date.now;Date.now=()=>current;
    try{
      for(const s of call.steps){
        let v:any=null;
        if(s.op==='create'){rounds.add(s.id);m.createSwarmRound(s.id,s.count);}
        if(s.op==='end')m.endSwarmRound(s.id);
        if(s.op==='time')current=s.now;
        if(s.op==='execute'){try{v=await tool.execute(s.input??{},{swarmRoundId:s.round,swarmParticipant:s.from}as any);}catch{v={error:true};}}
        if(s.op==='observe')v=aliases[s.alias];
        if(s.retain)aliases[s.retain]=v;
        results.push(v);
      }
      return results;
    }finally{Date.now=now;for(const id of rounds)m.endSwarmRound(id);}
  }
  throw new Error('unknown operation');
}
