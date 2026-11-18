import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
export async function dispatch(call:any) {
  if(call.op==='nativediagrams.metadata') {
    const {createArchitectureTool}=await import('../../../packages/gateway/src/tools/architecture-tools.ts');
    const {createDiagramTool}=await import('../../../packages/gateway/src/tools/diagram-tools.ts');
    return JSON.parse(JSON.stringify([createArchitectureTool(),createDiagramTool()]));
  }
  if(call.op==='nativediagrams.render') {
    const {createDiagramTool}=await import('../../../packages/gateway/src/tools/diagram-tools.ts');
    const tool=createDiagramTool();return Promise.all(call.values.map((input:any)=>tool.execute(input,{} as any)));
  }
  if(call.op==='nativediagrams.tool') {
    const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
    const {ArchitectureDiagramService}=await import('../../../packages/gateway/src/services/architecture-diagrams.ts');
    const {createArchitectureTool}=await import('../../../packages/gateway/src/tools/architecture-tools.ts');
    const log=console.log;console.log=(...a)=>console.error(...a);
    const {db,sqlite}=await openDatabase(':memory:');const RealDate=Date;
    try {
      migrateDatabase(sqlite);
      globalThis.Date=class extends RealDate {constructor(v?:any){super(v===undefined?call.now:v);}} as DateConstructor;
      const events:any[]=[];
      const ws=call.ws?{sendUICommand(command:any,session:any){events.push({command,session:session??null});if(call.failSink)throw new Error('sink failed');}}:undefined;
      const store=call.store===false?undefined:new ArchitectureDiagramService(db);
      if(call.failStore)sqlite.exec('DROP TABLE architecture_diagrams');
      const tool=createArchitectureTool(ws as any,store);
      const context={projectRoot:('projectRoot' in call)?call.projectRoot:call.root,userId:call.user,sessionId:call.session};
      let result:any;try{result=await tool.execute(call.input,context as any);}catch{result={error:true};}
      let fileText=null;try{fileText=readFileSync(call.root+'/.jait/architecture.mmd','utf8');}catch{}
      const id=result.data?.requestId??events[0]?.command?.data?.requestId;
      const idValid=id?(/^[A-Za-z0-9_-]{21}$/.test(id)):null;
      const idConsistent=id?events.every(e=>e.command.data.requestId===id):null;
      let rows=null;try{rows=sqlite.query('SELECT user_id,diagram FROM architecture_diagrams ORDER BY rowid').all();}catch{}
      const output=JSON.stringify({result,events,fileText,idValid,idConsistent,rows}).replaceAll(call.root,'<root>');
      return JSON.parse(id?output.replaceAll(id,'<request>'):output);
    }finally{globalThis.Date=RealDate;sqlite.close();console.log=log;}
  }

  if(call.op==='nativediagrams.paths') {
    const {PathGuard}=await import('../../../packages/gateway/src/security/path-guard.ts');
    const g=new PathGuard({projectRoot:call.root,deniedPaths:call.denied,checkSymlinks:call.checkSymlinks});
    const results=[];
    for(const step of call.steps) {
      try {
        const path=step.symlink?await g.validateWithSymlinkCheck(step.target):g.validate(step.target);
        results.push({path,allowed:g.isAllowed(step.target),root:g.projectRoot});
      }catch(e:any) {
        results.push(e.code==='PATH_TRAVERSAL'?{error:e.message,name:e.name,code:e.code,path:e.path,boundary:e.boundary,allowed:g.isAllowed(step.target)}:{error:true});
      }
    }
    return results;
  }
  if(call.op==='nativediagrams.service') {
    const {openDatabase,migrateDatabase}=await import('../../../packages/gateway/src/db/connection.ts');
    const {ArchitectureDiagramService}=await import('../../../packages/gateway/src/services/architecture-diagrams.ts');
    const log=console.log;console.log=(...a)=>console.error(...a);
    const {db,sqlite}=await openDatabase(':memory:');
    const RealDate=Date;
    try {
      migrateDatabase(sqlite);
      globalThis.Date=class extends RealDate {
        constructor(v?:any){super(v===undefined?call.now:v);}
        static now(){return RealDate.parse(call.now);}
      } as DateConstructor;
      mkdirSync(call.root,{recursive:true});
      const service=new ArchitectureDiagramService(db),results=[],ids:any={};
      for(const s of call.steps) {
        const projectRoot=(s.root??'$ROOT').replaceAll('$ROOT',call.root);
        let v:any=null;
        try {
          if(s.op==='save') v=await service.save({projectRoot,diagram:s.diagram,userId:s.user});
          if(s.op==='get') v=service.getByProject(projectRoot,s.user);
          if(s.op==='list') v=service.list(s.user);
          if(s.op==='path') v=service.getFilePath(projectRoot);
          if(s.op==='sql') sqlite.exec(s.sql.replaceAll('$ROOT',call.root));
          if(s.op==='file') {
            const path=service.getFilePath(projectRoot);
            if(s.remove)rmSync(path,{recursive:true,force:true});
            else if(s.directory)mkdirSync(path,{recursive:true});
            else {mkdirSync(dirname(path),{recursive:true});writeFileSync(path,s.bytes?Buffer.from(s.bytes):s.content);}
          }
          if(s.op==='read')v=readFileSync(service.getFilePath(projectRoot),'utf8');
          if(s.alias)ids[s.alias]=v.id;
          if(s.sameAs)v={record:v,sameId:v.id===ids[s.sameAs]};
        }catch(e:any){v={error:['projectRoot is required','diagram is required'].includes(e.message)?e.message:true};}
        results.push(v);
      }
      return JSON.parse(JSON.stringify(results).replaceAll(call.root,'<root>').replace(/[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,'<uuid>'));
    } finally {globalThis.Date=RealDate;sqlite.close();console.log=log;}
  }
  throw new Error('unknown operation');
}
