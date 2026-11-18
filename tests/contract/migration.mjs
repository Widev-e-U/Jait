import { completeCases, targetCases } from './migration-report.mjs'
import { flowCoverage, flowMarkdown } from './flow-report.mjs'
// Same contract targets, explicit backend selection, source-bound reviewable results.
import { spawn } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { createHash, randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { homedir } from 'node:os'

const root=fileURLToPath(new URL('../../',import.meta.url))
const args=process.argv.slice(2)
let backend
let streamArgv
while(args.length){
  const flag=args.shift(), value=args.shift()
  if(flag==='--backend' && backend===undefined && ['bun','rust'].includes(value)) backend=value
  else if(flag==='--active-stream-argv' && streamArgv===undefined && value?.length<=65536){
    const argv=JSON.parse(value)
    if(!Array.isArray(argv)||argv.length<1||argv.length>64||argv.some(a=>typeof a!=='string'||a.includes('\0')||a.length>8192)||!argv[0].trim())throw new Error('Invalid active-stream argv')
    streamArgv=JSON.stringify(argv)
  } else throw new Error('Usage: node tests/contract/migration.mjs --backend bun|rust [--active-stream-argv JSON]')
}
if(!backend)throw new Error('--backend bun|rust is required')
const directory=join(root,'.jait/artifacts/migration-suite',`${backend}-${randomUUID()}`)
mkdirSync(directory,{recursive:true})
const target=join(root,'.jait/artifacts/rust-contract-target')
const cargo=process.env.CARGO || join(homedir(),'.cargo/bin',process.platform==='win32'?'cargo.exe':'cargo')
const executable=name=>join(target,'debug',name+(process.platform==='win32'?'.exe':''))
const env={...process.env,CARGO_TARGET_DIR:target,CARGO_BUILD_JOBS:'2',CARGO_TERM_COLOR:'never',CARGO_TERM_PROGRESS_WHEN:'never'}
delete env.JAIT_MIGRATION_ADAPTER_ARGV
delete env.JAIT_CONTRACT_BACKEND_ARGV
delete env.JAIT_CONTRACT_ACTIVE_STREAM_ARGV
if(streamArgv)env.JAIT_CONTRACT_ACTIVE_STREAM_ARGV=streamArgv
const sources=[
  'tests/contract/tests/migration_boundaries.rs','tests/contract/tests/active_stream.rs','tests/contract/tests/migration_process.rs','tests/contract/tests/chat_flow.rs',
  'tests/contract/src/migration_driver.rs','tests/contract/src/fixture.rs','tests/contract/src/backend.rs','tests/contract/src/client.rs','tests/contract/src/provider_fixture.rs','tests/contract/src/bin/migration-adapter.rs',
  'tests/contract/corpus/current-payloads.json',
  ...['boundaries','recovery','mcp','mcp-peer','acp','acp-entry','messenger','git','forge','pty','watcher'].map(n=>`tests/contract/drivers/migration-${n}.ts`),
  'tests/contract/drivers/active-stream.ts','packages/gateway/src/tools/mcp-bridge.ts','packages/gateway/src/services/project-watcher.ts',
  'packages/gateway-rust/src/services/persisted_tool_calls.rs',
]
function runtimeFiles(directory){
  return readdirSync(join(root,directory),{withFileTypes:true}).flatMap(entry=>{
    const path=`${directory}/${entry.name}`
    return entry.isDirectory()?runtimeFiles(path):/\.(ts|mjs|rs|json)$/.test(path)&&!path.endsWith('.test.ts')?[path]:[]
  })
}
sources.push('tests/contract/flows/chat.json','tests/contract/flow-report.mjs','tests/contract/migration.mjs','tests/contract/migration-report.mjs','tests/contract/migration-cases.json','tests/contract/tsconfig.migration.json','tests/contract/Cargo.toml','tests/contract/Cargo.lock','packages/gateway-rust/Cargo.toml','package.json','bun.lock',
  ...runtimeFiles('packages/gateway/src'),...runtimeFiles('packages/gateway-rust/src'),...runtimeFiles('packages/shared/src'))
const snapshot=()=>Object.fromEntries([...new Set(sources)].sort().map(p=>[p,createHash('sha256').update(readFileSync(join(root,p))).digest('hex')]))
const hashes=snapshot()
let active
for(const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>active?.kill(signal))
async function command(name,argv){
  let output='';let truncated=false
  const exit=await new Promise((resolve,reject)=>{
    active=spawn(cargo,[argv[0],'--locked','--manifest-path',join(root,'tests/contract/Cargo.toml'),...argv.slice(1)],{cwd:root,env,stdio:['ignore','pipe','pipe']})
    for(const stream of [active.stdout,active.stderr]) stream.on('data',chunk=>{if(output.length<2*1024*1024)output+=chunk;else truncated=true})
    active.once('error',reject);active.once('exit',code=>resolve(code??1))
  })
  writeFileSync(join(directory,`${name}.log`),output)
  if(truncated) throw new Error('test log exceeded 2 MiB')
  return {exit,output}
}
const inventory=JSON.parse(readFileSync(join(root,'tests/contract/migration-cases.json'),'utf8'))
let results=[]
let setupError
try{
  if(inventory.platform!==process.platform)throw new Error(`Scenario inventory requires ${inventory.platform}; this platform is not verified`)
  if(backend==='rust'){
    const build=await command('build-native',['build','--bin','migration-adapter','--bin','gateway-native'])
    if(build.exit!==0)throw new Error('native adapter build failed; inspect build-native.log')
    env.JAIT_MIGRATION_ADAPTER_ARGV=JSON.stringify([executable('migration-adapter')])
    env.JAIT_CONTRACT_BACKEND_ARGV=JSON.stringify([executable('gateway-native')])
  } else {
    env.JAIT_MIGRATION_ADAPTER_ARGV=JSON.stringify([process.env.JAIT_CONTRACT_BUN || 'bun','--no-env-file',join(root,'tests/contract/drivers/migration-boundaries.ts')])
  }
  for(const test of ['migration_boundaries','migration_process','active_stream','chat_flow']){
    if(backend==='rust' && test==='active_stream' && !streamArgv){
      // The selected binary has no provider/tool fixture composition yet. Do not
      // fall back to the Bun adapter or count helper tests as Rust stream evidence.
      for(const id of inventory.cases.filter(id=>id.startsWith('active_stream/')))
        results.push({id,status:'blocked',reason:'Native active-stream fixture/provider composition is not implemented'})
      continue
    }
    const run=await command(test,['test','--test',test,'--','--test-threads=2'])
    results.push(...targetCases(test,run))
  }
}catch(error){setupError=error.message}
try { results=completeCases(inventory.cases,results) } catch(error) {setupError=error.message}
let flow
try {
  flow=flowCoverage(JSON.parse(readFileSync(join(root,'tests/contract/flows/chat.json'),'utf8')),inventory.cases,results,path=>readFileSync(join(root,path),'utf8'))
  writeFileSync(join(directory,'chat-flow.json'),JSON.stringify(flow,null,2)+'\n')
  writeFileSync(join(directory,'chat-flow.md'),flowMarkdown(flow,backend,root))
} catch(error) {setupError=error.message}
const unchanged=JSON.stringify(hashes)===JSON.stringify(snapshot())
const report={format:1,backend,flow_report:flow?'chat-flow.json':null,active_stream_adapter:streamArgv?{selection:'caller-supplied',argv_sha256:createHash('sha256').update(streamArgv).digest('hex')}:backend==='rust'?'unavailable':'bun-reference',generated_at:new Date().toISOString(),sources_unchanged:unchanged,source_sha256:hashes,setup_error:setupError??null,cases:results,summary:Object.fromEntries(['passed','failed','blocked'].map(status=>[status,results.filter(r=>r.status===status).length])),passed:!setupError&&unchanged&&results.length>0&&results.every(r=>r.status==='passed'),not_covered:['Archived released database binaries and historical field encodings','Windows ConPTY/macOS execution','General unbounded-stream memory/backpressure guarantees','Every shipping startup failure and hung-disposer combination','Complete public API/WS and scanner scope matrix']}
writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n')
console.log(JSON.stringify({backend,...report.summary,success:report.passed,report:join(directory,'report.json')}))
process.exitCode=report.passed?0:1
