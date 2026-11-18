/** Disposable production assignment services. Git I/O and broadcasts are the
 * injected boundaries; SQLite and filesystem metadata checks remain real. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {ProjectService} from '../../../packages/gateway/src/services/projects.ts';
import {RepositoryService} from '../../../packages/gateway/src/services/repositories.ts';
import {ProjectRepositoryAssignmentError,assignRepositoryToProject,autoAssignProjectRepositories,projectHasGitMetadata,shouldAutoClaimRepositoryForNode} from '../../../packages/gateway/src/services/project-repositories.ts';
export async function dispatch(call:any) {
  if(call.op==='nativeassignment.paths') return {git:call.roots.map(projectHasGitMetadata),claim:call.claims.map((v:any)=>shouldAutoClaimRepositoryForNode(v.path,v.platform))};
  const log=console.log,OriginalDate=Date;console.log=(...args)=>console.error(...args);
  const {db,sqlite}=await openDatabase(':memory:');
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}} as DateConstructor;
    const projectService=new ProjectService(db),repoService=new RepositoryService(db);
    const events:any[]=[],calls:any[]=[],results:any[]=[];
    const response=(method:string,args:any[],fallback:any)=>{calls.push([method,...args]);if(call.git?.[method]?.error)throw Error('git failed');return call.git?.[method]?.value??fallback;};
    const gitService={status:(root:string)=>response('status',[root],{branch:null,remoteUrl:null}),getPreferredRemote:(root:string,branch:any)=>response('preferred',[root,branch??null],null),getRemoteUrl:(root:string,remote:string)=>response('remote',[root,remote],null),resolveDefaultBranch:(root:string,remote:any)=>response('default',[root,remote??null],'main')} as any;
    const ws={broadcastAll:(event:any)=>events.push({event:event.type.replace('repo.',''),repo:structuredClone(event.payload.repo)})} as any;
    for(const step of call.steps) {
      try {
        if(step.op==='sql'){sqlite.exec(step.sql);results.push(null);continue;}
        const params={projectService,repoService,gitService,ws,userId:step.user};
        results.push(structuredClone(step.op==='auto'?await autoAssignProjectRepositories(params):await assignRepositoryToProject({...params,projectId:step.project,repoId:step.repo})));
      } catch(error:any){results.push(error instanceof ProjectRepositoryAssignmentError?{code:error.code,message:error.message}:{error:true});}
    }
    return {results,events,calls,repositories:repoService.list().sort((a,b)=>a.localPath.localeCompare(b.localPath)),projects:sqlite.query('SELECT id,metadata,last_active_at AS lastActiveAt FROM projects ORDER BY id').all()};
  } finally {sqlite.close();console.log=log;globalThis.Date=OriginalDate;}
}
