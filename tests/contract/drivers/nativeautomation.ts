/** Production SQLite repositories; inputs and assertions live in the Rust suite. */
import {openDatabase,migrateDatabase} from '../../../packages/gateway/src/db/connection.ts';
import {RepositoryService} from '../../../packages/gateway/src/services/repositories.ts';
import {RepoProposalService} from '../../../packages/gateway/src/services/repo-proposals.ts';
import {PlanService,newTaskId} from '../../../packages/gateway/src/services/plans.ts';
export async function dispatch(call:any) {
  if(call.op==='nativeautomation.taskids')return Array.from({length:32},()=>newTaskId());
  if(call.op!=='nativeautomation.run')throw new Error('unknown native automation operation');
  const OriginalDate=Date;const {db,sqlite}=await openDatabase(':memory:');const log=console.log;console.log=(...args)=>console.error(...args);
  try {
    migrateDatabase(sqlite);if(call.seed)sqlite.exec(call.seed);
    const now=OriginalDate.parse(call.now);
    globalThis.Date=class extends OriginalDate {constructor(value?:any){super(value===undefined?now:value)}static override now(){return now}} as DateConstructor;
    const repos=new RepositoryService(db),proposals=new RepoProposalService(db),plans=new PlanService(db);
    const results:any[]=[];let created:string|undefined;
    for(const step of call.steps) {
      const id=step.id==='$created'?created!:step.id;let value:any=null;
      try {
        switch(step.op) {
          case 'repo.create':value=repos.create(step.data);created=value.id;break;
          case 'repo.get':value=repos.getById(id)??null;break;
          case 'repo.list':value=repos.list(step.user);break;
          case 'repo.find':value=repos.findByPath(step.path,step.user)??null;break;
          case 'repo.update':value=repos.update(id,step.data)??null;break;
          case 'repo.delete':repos.delete(id);break;
          case 'proposal.create':value=proposals.create(step.data);created=value.id;break;
          case 'proposal.get':value=proposals.getById(id)??null;break;
          case 'proposal.list':value=proposals.listByRepo(step.repo);break;
          case 'proposal.update':value=proposals.update(id,step.data)??null;break;
          case 'proposal.delete':proposals.delete(id);break;
          case 'plan.create':value=plans.create(step.data);created=value.id;break;
          case 'plan.get':value=plans.getById(id)??null;break;
          case 'plan.list':value=plans.listByRepo(step.repo);break;
          case 'plan.listUser':value=plans.listByUser(step.user);break;
          case 'plan.update':value=plans.update(id,step.data)??null;break;
          case 'plan.task':value=plans.updateTask(id,step.task,step.data)??null;break;
          case 'plan.delete':plans.delete(id);break;
          case 'sql':sqlite.exec(step.sql);break;
          default:throw new Error('unknown operation');
        }
        results.push(structuredClone(value));
      }catch{results.push({error:true})}
    }
    return {results,repositories:sqlite.query('SELECT * FROM automation_repositories ORDER BY id').all(),
      proposals:sqlite.query('SELECT * FROM automation_repo_proposals ORDER BY id').all(),
      plans:sqlite.query('SELECT * FROM automation_plans ORDER BY id').all()};
  }finally{globalThis.Date=OriginalDate;console.log=log;sqlite.close()}
}
