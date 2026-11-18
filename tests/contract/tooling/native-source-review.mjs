/** Reconcile explicitly reviewed reference contracts; never awards native progress. */
import {readFileSync,writeFileSync,mkdirSync,readdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash,randomUUID} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const registryPath='tests/contract/reviews/native-source-reconciliation.json';
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
const read=p=>readFileSync(join(root,p));
function fnv(bytes){let h=0xcbf29ce484222325n;for(const b of bytes)h=BigInt.asUintN(64,(h^BigInt(b))*0x100000001b3n);return h.toString(16).padStart(16,'0');}
function snapshot(){
 const files={};const excluded=new Set(['node_modules','dist','build','web-dist','target','.git']);
 for(const p of ['package.json','bun.lock','.github/workflows/ci.yml','.github/workflows/release.yml']) files[p]=fnv(read(p));
 const walk=p=>{for(const e of readdirSync(join(root,p),{withFileTypes:true})){if(excluded.has(e.name))continue;const f=p+'/'+e.name;if(e.isDirectory())walk(f);else if(e.isFile()&&(/\.(rs|ts|tsx|js|mjs|cjs|toml|lock)$/.test(f)||(f.endsWith('.json')&&(/tests\/contract\/(vectors|corpus)\//.test(f)||f==='tests/contract/interfaces.json'))||(f.endsWith('.txt')&&f.startsWith('tests/contract/tooling/sources/'))))files[f]=fnv(read(f));}};
 for(const p of ['packages/gateway','packages/shared/src','tests/contract'])walk(p);
 return {algorithm:'fnv1a64-by-file',files:Object.fromEntries(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en')))};
}
export function validateReview(registry,report,read){
 assert.equal(report.profile,'reviewed-native-reference-contracts');assert.equal(report.backend_label,'typescript');assert.equal(report.success,true);assert.equal(report.sources_unchanged,true);
 assert.equal(registry.schema_version,1);assert.ok(registry.sources.length);assert.equal(new Set(registry.sources.map(s=>s.path)).size,registry.sources.length);
 assert.deepEqual(report.reviewed_sources,registry.sources.map(s=>s.path));
 for(const [path,digest] of Object.entries(report.source_sha256)){assert.equal(hash(read(path)),digest,'stale review evidence: '+path);}
 assert.equal(report.source_sha256[registryPath],hash(read(registryPath)));
 for(const s of registry.sources){assert.equal(hash(read(s.path)),s.sha256,'reviewed source changed: '+s.path);assert.ok(s.review.trim());assert.ok(s.cases.length);
  for(const c of s.cases){assert.equal(report.source_sha256[c.source],hash(read(c.source)));assert.ok(read(c.source).toString().includes(c.id));assert.ok(report.cases.some(r=>r.id===c.id&&r.target===c.target&&r.status==='passed'),'missing passing case '+c.id);}
 }
 return registry.sources;
}
function execute(){
 const registry=JSON.parse(read(registryPath));const native=JSON.parse(read('packages/gateway-rust/native-coverage.json'));
 const sources=new Set([registryPath,'packages/gateway-rust/native-coverage.json','packages/gateway-rust/Cargo.toml','packages/gateway-rust/Cargo.lock']);
 for(const s of registry.sources){const n=native.components.find(c=>c.reference===s.path);assert.equal(n?.status,'verified');assert.equal(hash(read(s.path)),s.sha256);assert.equal(n.reference_sha256,s.sha256);for(const p of [s.path,...n.native,...n.contracts])sources.add(p);}
 for(const p of readdirSync(join(root,'packages/gateway-rust/src'),{recursive:true,withFileTypes:true}).filter(e=>e.isFile()).map(e=>join(e.parentPath,e.name).slice(root.length)))sources.add(p);
 const before=snapshot();const sha=Object.fromEntries([...sources].sort().map(p=>[p,hash(read(p))]));
 const directory=join(root,'.jait/artifacts/contracts','native-review-'+randomUUID());mkdirSync(directory,{recursive:true});
 const targets=[...new Set(registry.sources.flatMap(s=>s.cases.map(c=>c.target)))];const cases=[];let good=true;
 for(const target of targets){
  const result=spawnSync(process.execPath,[join(root,'tests/contract/run.mjs'),'test','--test',target,'--','--test-threads=2','--color','never'],{cwd:root,encoding:'utf8',maxBuffer:16*1024*1024,timeout:180000});
  const output=(result.stdout??'')+(result.stderr??'');writeFileSync(join(directory,target+'.log'),output);
  const expected=[...new Set(registry.sources.flatMap(s=>s.cases).filter(c=>c.target===target).map(c=>c.id))];
  for(const id of expected){const status=output.split('\n').some(line=>line===`test ${id} ... ok`)?'passed':'failed';cases.push({id,target,status});if(status!=='passed')good=false;}
  if(result.status!==0)good=false;
  console.log(`${target}: ${result.status===0?'passed':'failed'}`);
 }
 const after=snapshot();const unchanged=JSON.stringify(before)===JSON.stringify(after)&&Object.entries(sha).every(([p,h])=>hash(read(p))===h);
 const report={schema_version:1,profile:'reviewed-native-reference-contracts',backend_label:'typescript',success:good&&unchanged,sources_unchanged:unchanged,source_fingerprints:before,source_sha256:sha,reviewed_sources:registry.sources.map(s=>s.path),cases,limits:['Focused differential reference behavior; scope and residual gaps remain in each reviewed source entry.','No additional native implementation or production composition credit.']};
 writeFileSync(join(directory,'report.json'),JSON.stringify(report,null,2)+'\n');console.log('Report: '+join(directory,'report.json'));if(!report.success)process.exitCode=1;
}
function apply(path){
 assert.ok(path.startsWith('.jait/artifacts/')&&!path.split('/').includes('..'));
 const registry=JSON.parse(read(registryPath)),report=JSON.parse(read(path));const sources=validateReview(registry,report,read);assert.deepEqual(snapshot(),report.source_fingerprints,'current source snapshot differs from evidence');
 const inventory=JSON.parse(read('tests/contract/coverage.json'));
 for(const source of sources){const item=inventory.source_files.find(s=>s.path===source.path);assert.ok(item);assert.equal(item.fingerprint,fnv(read(source.path)));if(item.status==='verified')continue;
  item.status='verified';item.parity_review=source.review+' Reconciled with current reviewed differential source evidence; bounded scope only. See tests/contract/reviews/native-source-reconciliation.json. Native implementation progress and production acceptance remain separate.';
  item.rust_cases=source.cases.map(({id,source})=>({id,source,report:path}));
 }
 writeFileSync(join(root,'tests/contract/coverage.json'),JSON.stringify(inventory,null,2)+'\n');console.log('Source reviews complete: '+inventory.source_files.filter(s=>s.status==='verified').length+'/'+inventory.source_files.length);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){if(process.argv[2]==='--apply')apply(process.argv[3]);else{assert.equal(process.argv.length,2);execute();}}
