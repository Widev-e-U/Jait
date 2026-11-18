// Run restored mutants in an isolated source snapshot, never the live gateway tree.
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, symlinkSync, existsSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
const root = fileURLToPath(new URL('../../../', import.meta.url));
const output = join(root, '.jait/artifacts/context-mutations');
const reportPath = join(output, 'report.json');
const files = ['packages/gateway/src/services/context-budget.ts', 'packages/gateway/src/services/context-cache.ts',
  'packages/gateway/src/tools/context-evidence.ts', 'packages/gateway/src/providers/context-control.ts',
  'packages/gateway-rust/src/services/context_budget.rs', 'packages/gateway-rust/src/tools/context_evidence.rs',
  'packages/gateway-rust/src/providers/context_control.rs', 'tests/contract/drivers/contextbudget.ts',
  'tests/contract/tests/gateway_rust_context_budget.rs', 'tests/contract/tooling/context-budget-mutations.mjs'];
const digest = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(readFileSync(join(root,file))).digest('hex')]));
if (process.argv.includes('--check')) {
  const report = JSON.parse(readFileSync(reportPath, 'utf8'));
  if (!report.passed || JSON.stringify(report.sources) !== JSON.stringify(digest())) throw new Error('Context mutation evidence missing or stale; run context-budget-mutations.mjs');
  console.log('Context mutation evidence is current');
  process.exit(0);
}
mkdirSync(output, {recursive:true});
const workspace = join(output, 'snapshot');
rmSync(workspace, {recursive:true,force:true}); mkdirSync(workspace,{recursive:true});
const listing=spawnSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8'});
if(listing.status!==0)throw new Error('Cannot capture source snapshot');
for(const file of listing.stdout.split('\0').filter(Boolean)){
  if(file.split('/').some(part=>['.jait','node_modules','target','dist','web-dist','.git'].includes(part)))continue;
  if(!file.startsWith('packages/gateway/') && !file.startsWith('packages/gateway-rust/') && !file.startsWith('packages/shared/') && !file.startsWith('tests/contract/') && file.includes('/'))continue;
  const destination=join(workspace,file);mkdirSync(dirname(destination),{recursive:true});copyFileSync(join(root,file),destination);
}
for(const relative of ['node_modules','packages/gateway/node_modules']){
 const source=join(root,relative),destination=join(workspace,relative);if(existsSync(source)){mkdirSync(dirname(destination),{recursive:true});symlinkSync(source,destination,'dir');}
}
const before=digest();
const mutations=[
 ['ts-recovery','packages/gateway/src/tools/context-evidence.ts','if (toolName === "context.read")','if (false)'],
 ['rust-recovery','packages/gateway-rust/src/tools/context_evidence.rs','if tool_name == "context.read"','if false'],
 ['ts-budget','packages/gateway/src/services/context-budget.ts','toolResultChars: 8_000','toolResultChars: 30_000'],
 ['ts-owner','packages/gateway/src/tools/context-evidence.ts','record.userId !== scope.userId','record.userId === scope.userId'],
 ['ts-anchor','packages/gateway/src/services/context-budget.ts','contextFingerprint(messages.slice(0, anchor.count), identity) !== anchor.prefix','false'],
 ['ts-cache','packages/gateway/src/services/context-cache.ts','route.backend !== "openrouter"','route.backend === "openrouter"'],
 ['ts-prune','packages/gateway/src/services/context-budget.ts','index >= keepFrom','index < keepFrom'],
 ['ts-price','packages/gateway/src/services/context-budget.ts','usage.inputTokens - usage.cachedInputTokens - usage.cacheWriteTokens','usage.inputTokens'],
 ['rust-owner','packages/gateway-rust/src/tools/context_evidence.rs','r["userId"] == user','r["userId"] != user'],
 ['rust-anchor','packages/gateway-rust/src/services/context_budget.rs','anchor["prefix"] == context_fingerprint(&messages[..n], identity)','true'],
 ['rust-cache','packages/gateway-rust/src/services/context_budget.rs','route["backend"] != "openrouter"','route["backend"] == "openrouter"'],
 ['rust-prune','packages/gateway-rust/src/services/context_budget.rs','i >= keep_from','i < keep_from'],
 ['rust-price','packages/gateway-rust/src/services/context_budget.rs','input - cached - write','input'],
 ['rust-owner-plan','packages/gateway-rust/src/services/context_budget.rs','input["owner"] == "jait"','input["owner"] == "provider"'],
];
function run(name){
 const result=spawnSync(process.execPath,[join(workspace,'tests/contract/run.mjs'),'test','--test','gateway_rust_context_budget'],{cwd:workspace,encoding:'utf8',timeout:180000,maxBuffer:2*1024*1024});
 writeFileSync(join(output,`${name}.log`),(result.stdout??'')+(result.stderr??''));
 return result.status;
}
const checks=[];
if(run('baseline')!==0)throw new Error('Snapshot baseline failed; inspect context-mutations/baseline.log');
for(const [name,file,find,replace] of mutations){
 const path=join(workspace,file),original=readFileSync(path,'utf8');
 if(!original.includes(find))throw new Error(`Mutation anchor missing: ${name}`);
 try{writeFileSync(path,original.replace(find,replace));const status=run(name);checks.push({name,caught:status!==0 && status!==null,exit:status});console.log(`${name}: ${status!==0 && status!==null?'caught':'FAILED'}`);}
 finally{writeFileSync(path,original);}
}
const restored=run('restored')===0;
const sources=digest();const passed=restored && checks.every(check=>check.caught) && JSON.stringify(before)===JSON.stringify(sources);
writeFileSync(reportPath,JSON.stringify({passed,restored,checks,sources},null,2)+'\n');
console.log(JSON.stringify({passed,controls:checks.length,report:'.jait/artifacts/context-mutations/report.json'}));
if(!passed)process.exitCode=1;
