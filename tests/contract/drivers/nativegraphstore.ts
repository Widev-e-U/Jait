/** Real SQLite CodeGraphService; only extraction and git-revision ports are scripted. */
import { CodeGraphService } from '../../../packages/gateway/src/services/code-graph/code-graphs.ts';
import { openDatabase } from '../../../packages/gateway/src/db/connection.ts';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
const root = resolve(import.meta.dirname, '../../..');
const schema = `CREATE TABLE code_graph_indexes (
  id TEXT PRIMARY KEY,user_id TEXT,repository_id TEXT,project_root TEXT NOT NULL,
  provider TEXT NOT NULL DEFAULT 'graphify',status TEXT NOT NULL DEFAULT 'missing',
  graph_path TEXT,graph_version TEXT,source_revision TEXT,graphify_version TEXT,stats TEXT,
  graphrag_status TEXT NOT NULL DEFAULT 'not-prepared',graphrag_path TEXT,error TEXT,
  created_at TEXT NOT NULL,updated_at TEXT NOT NULL
); CREATE UNIQUE INDEX idx_code_graph_indexes_user_project ON code_graph_indexes(user_id,project_root)`;
function normalize(value: any, work: string, ids: Map<string,string>): any {
  if (typeof value === 'string') return ids.get(value) ?? value.split(work).join('$WORK');
  if (Array.isArray(value)) return value.map(v=>normalize(v,work,ids));
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,normalize(v,work,ids)]));
  return value;
}
export async function dispatch(call: any) {
  const work=resolve(call.workspace);
  if (!work.startsWith(join(root,'.jait/artifacts/gateway-rust/code-graph/'))) throw Error('Invalid graph fixture path');
  await mkdir(work,{recursive:true});
  const {db,sqlite}=await openDatabase(':memory:');sqlite.exec(schema);
  const OriginalDate=globalThis.Date;
  const now=1790000000123;
  globalThis.Date=class extends OriginalDate {
    constructor(...args:any[]) {super(...(args.length?args:[now]) as [any]);}
    static now(){return now;}
  } as any;
  const builds:any[]=[];
  let buildIndex=0;
  const runner={build:async(params:any)=>{
    builds.push({projectRoot:params.projectRoot,outputDir:params.outputDir,aborted:params.signal?.aborted??null});
    const outcome=call.builds?.[buildIndex++]??{};
    if(outcome.delay)await new Promise(r=>setTimeout(r,outcome.delay));
    if(outcome.error)throw Error(outcome.error);
    const graphPath=join(params.outputDir,'graphify-out','graph.json');
    if(!outcome.missing) {
      await mkdir(join(params.outputDir,'graphify-out'),{recursive:true});
      await writeFile(graphPath,outcome.bytes?Buffer.from(outcome.bytes):outcome.content??JSON.stringify(outcome.graph??call.graph??{}),'utf8');
    }
    return {graphPath,version:outcome.version??'graphify fixture',stdout:'',stderr:''};
  }};
  const service=new CodeGraphService(db,{dataRoot:join(work,'data'),runner:runner as any});
  (service as any).sourceRevision=async()=>call.revision??null;
  const steps:any[]=[];
  const project=call.project??join(work,'project');
  const params=(a:any)=>({projectRoot:a.projectRoot??project,...(a.user!==undefined?{userId:a.user}:{}),...(a.repository!==undefined?{repositoryId:a.repository}:{}),...a.params});
  try {
    for(const action of call.actions) {
      try {
        const p=params(action);
        switch(action.op) {
          case 'get':steps.push(service.getIndex(p.projectRoot,p.userId));break;
          case 'index':steps.push(await service.index(p));break;
          case 'parallel':steps.push(await Promise.all([service.index(p),service.index(p)]));break;
          case 'snapshot':steps.push(await service.snapshot(p));break;
          case 'query':steps.push(await service.query(p));break;
          case 'path':steps.push(await service.shortestPath(p));break;
          case 'prepare':steps.push(await service.prepareGraphRag(p));break;
          case 'sql':sqlite.exec(action.sql);steps.push({executed:true});break;
          case 'overwrite': {
            const index=service.getIndex(p.projectRoot,p.userId);await writeFile(index.graphPath!,action.content,'utf8');steps.push({written:true});break;
          }
          default:throw Error('Unknown graph lifecycle operation');
        }
      }catch(error){steps.push({error:error instanceof Error?error.message:String(error)});}
    }
    const rows=sqlite.query('SELECT * FROM code_graph_indexes ORDER BY rowid').all() as any[];
    const ids=new Map<string,string>(rows.map(r=>[r.id,`$INDEX:${r.user_id??'null'}:${r.project_root}`]));
    const exports:any[]=[];
    for(const row of rows)if(row.graphrag_path) {
      const manifest=JSON.parse(await readFile(row.graphrag_path,'utf8'));
      exports.push({manifest,entities:await readFile(manifest.entitiesPath,'utf8'),relationships:await readFile(manifest.relationshipsPath,'utf8'),textUnits:await readFile(manifest.textUnitsPath,'utf8')});
    }
    // IDs and timestamps are nondeterministic implementation details; every other field is compared.
    const out=normalize({steps,rows,builds,exports},work,ids);
    // Normalize work paths embedded in serialized JSON/JSONL evidence too.
    return JSON.parse(JSON.stringify(out).split(work).join('$WORK'));
  }finally{globalThis.Date=OriginalDate;sqlite.close();}
}
