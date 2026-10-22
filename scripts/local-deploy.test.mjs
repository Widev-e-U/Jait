import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { VERIFY_STEPS, verifyAndActivate, activateLocal, snapshotSource, sourceFiles, digestFiles, overrideUnit } from './local-deploy.mjs';
const artifacts=fileURLToPath(new URL('../.jait/artifacts/local-deploy-tests/',import.meta.url));
async function fixture(t){await fs.mkdir(artifacts,{recursive:true});const root=await fs.mkdtemp(join(artifacts,'case-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));return root;}
function git(root,args){return execFileSync('git',['-C',root,...args],{encoding:'utf8'});}

test('all mandatory gates finish before activation; every failure blocks activation',async()=>{
  assert(VERIFY_STEPS.some(([id])=>id==='rust-migration'));
  assert.deepEqual(VERIFY_STEPS.find(([id])=>id==='rust-migration'), ['rust-migration', 'bun', ['run', 'test:gateway:rust', '--full-contracts']]);
  assert.equal(VERIFY_STEPS.some(([id])=>id==='rust-contracts'), false);
  assert(VERIFY_STEPS.some(([id])=>id==='unit-tests'));
  assert(VERIFY_STEPS.some(([id])=>id==='web-e2e'));
  for(const [failure] of VERIFY_STEPS){let activated=false;const ran=[];
    await assert.rejects(verifyAndActivate({fingerprint:async()=>'same',runStep:async(id)=>{ran.push(id);if(id===failure)throw Error('failed');},activate:async()=>{activated=true;}}));
    assert.equal(activated,false);assert.equal(ran.at(-1),failure);
  }
  const ran=[];await verifyAndActivate({fingerprint:async()=>'same',runStep:async(id)=>ran.push(id),activate:async proof=>{assert.equal(ran.length,VERIFY_STEPS.length);assert.equal(proof.checks.length,VERIFY_STEPS.length);ran.push('activate');}});
  assert.equal(ran.at(-1),'activate');
});
test('source/build drift after tests refuses activation',async()=>{
  let i=0;let activated=false;await assert.rejects(verifyAndActivate({fingerprint:async()=>String(i++),runStep:async()=>{},activate:async()=>{activated=true;}}),/changed/);assert.equal(activated,false);
});
test('snapshot honors nested ignores, dirty edits and deletions without changing parent git',async t=>{
  const root=await fixture(t),repo=join(root,'repo'),copy=join(root,'copy');await fs.mkdir(repo);
  git(repo,['init','--quiet']);await fs.writeFile(join(repo,'.gitignore'),'node_modules/\ndist/\n');
  await fs.writeFile(join(repo,'file.ts'),'before');await fs.writeFile(join(repo,'deleted.ts'),'deleted');
  git(repo,['add','.']);git(repo,['-c','user.name=Test','-c','user.email=test@localhost','commit','-qm','initial']);
  await fs.writeFile(join(repo,'file.ts'),'dirty');await fs.unlink(join(repo,'deleted.ts'));
  await fs.mkdir(join(repo,'nested'));await fs.writeFile(join(repo,'nested/.gitignore'),'ignored/\n');await fs.mkdir(join(repo,'nested/ignored'));await fs.writeFile(join(repo,'nested/ignored/private'),'private');
  await fs.mkdir(join(repo,'node_modules'));await fs.writeFile(join(repo,'node_modules/cache'),'cache');
  await fs.writeFile(join(repo,'new.ts'),'new');const before=git(repo,['status','--porcelain']);
  const result=await snapshotSource(repo,copy);
  assert.equal(await fs.readFile(join(copy,'file.ts'),'utf8'),'dirty');assert.equal(await fs.readFile(join(copy,'new.ts'),'utf8'),'new');
  for(const file of ['deleted.ts','nested/ignored/private','node_modules/cache'])await assert.rejects(fs.access(join(copy,file)));
  assert.equal(before,git(repo,['status','--porcelain']));assert.equal(result.sourceHash,await digestFiles(copy,sourceFiles(copy)));
  assert.equal(git(copy,['rev-parse','--show-toplevel']).trim(),copy);
});
test('snapshot rejects source symlinks escaping the repository',async t=>{
  const root=await fixture(t),repo=join(root,'repo');await fs.mkdir(repo);git(repo,['init','--quiet']);
  await fs.symlink('../outside',join(repo,'escape'));
  await assert.rejects(snapshotSource(repo,join(root,'copy')),/Unsafe deployment path/);
});
test('systemd overrides preserve literal arguments and reject control characters',()=>{
  const text=overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','--env','/a b/settings.env','--port','9000'], '/release/bin/jait.mjs');
  assert(overrideUnit(['/usr/bin/node','--max-old-space-size=4096','/old/bin/jait.mjs','--port','9000'],'/new/bin/jait.mjs').includes('"--max-old-space-size=4096"'));
  assert.match(text,/ExecStart=\n/);assert(text.includes('"/a b/settings.env"'));assert(text.includes('"9000"'));
  assert.equal(overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','--host','a%$b'],'/new/bin/jait.mjs').includes('a%%$$b'),true);
  assert.throws(()=>overrideUnit(['/usr/bin/node','/old/bin/jait.mjs','bad\narg'],'/new/bin/jait.mjs'));
  assert.throws(()=>overrideUnit(['/usr/bin/other','/old/bin/jait.mjs'],'/new/bin/jait.mjs'));
});
test('health failure restores only the local override before restarting the previous install',async()=>{
  const events=[];let health=0;const plan={override:'/test/90-jait-local.conf',unitText:'new',unit:'jait.service',port:8000,version:'new',previousVersion:'old'};
  await assert.rejects(activateLocal(plan,{read:async()=>'previous',write:async(path,text)=>events.push(['write',text]),remove:async()=>events.push(['remove']),command:async(program,args)=>events.push([program,...args]),health:async(port,version)=>{events.push(['health',version]);if(health++===0)throw Error('unhealthy');}}),/previous service configuration restored/);
  assert.deepEqual(events.filter(e=>e[0]==='write'),[['write','new'],['write','previous']]);assert.deepEqual(events.filter(e=>e[0]==='health'),[['health','new'],['health','old']]);
});
test('initial deployment removes its new override on failure; success never invokes rollback',async()=>{
  const plan={override:'/test/local.conf',unitText:'new',unit:'jait.service',port:8000,version:'new',previousVersion:'old'};
  const events=[];let attempts=0;
  await assert.rejects(activateLocal(plan,{read:async()=>{throw Object.assign(Error(),{code:'ENOENT'});},write:async()=>{},remove:async p=>events.push(p),command:async()=>{},health:async()=>{if(attempts++===0)throw Error('failed');}}));assert.deepEqual(events,[plan.override]);
  let starts=0;await activateLocal(plan,{read:async()=>'old',write:async()=>{},remove:async()=>assert.fail('rollback on success'),command:async(_program,args)=>{if(args.includes('restart'))starts++;},health:async()=>{}});assert.equal(starts,1);
});

test('process exit failures, signals and deadlines cannot become success',async t=>{
  const {runLogged}=await import('./local-deploy.mjs');const root=await fixture(t);
  await runLogged(process.execPath,['-e','console.log("passed")'],{log:join(root,'pass.log')});
  await assert.rejects(runLogged(process.execPath,['-e','console.log("partial");process.exit(7)'],{log:join(root,'fail.log')}),/failed \(7\)/);
  assert.match(await fs.readFile(join(root,'fail.log'),'utf8'),/partial/);
  await assert.rejects(runLogged(process.execPath,['-e','process.kill(process.pid,"SIGTERM")'],{log:join(root,'signal.log')}),/SIGTERM/);
  await assert.rejects(runLogged(process.execPath,['-e','setInterval(()=>{},1000)'],{log:join(root,'timeout.log'),timeoutMs:30}),/exceeded/);
});

test('activation controller refuses incomplete verification evidence before touching systemd',async t=>{
  const {runLogged}=await import('./local-deploy.mjs');const root=await fixture(t);
  const run=join(root,'runs','one');await fs.mkdir(run,{recursive:true});
  const plan=join(run,'plan.json');await fs.writeFile(plan,JSON.stringify({artifactRoot:root,runtime:join(root,'release'),proof:{checks:[]}}));
  const log=join(root,'controller.log');
  await assert.rejects(runLogged(process.execPath,[fileURLToPath(new URL('./local-deploy.mjs',import.meta.url)),'--activate',plan],{log}));
  assert.match(await fs.readFile(log,'utf8'),/Missing mandatory verification evidence/);
});

test('explicitly versioned files remain in snapshots even if a later ignore rule matches them',async t=>{
  const root=await fixture(t),repo=join(root,'repo'),copy=join(root,'copy');await fs.mkdir(repo);git(repo,['init','--quiet']);
  await fs.writeFile(join(repo,'versioned.fixture'),'needed');git(repo,['add','versioned.fixture']);
  await fs.writeFile(join(repo,'.gitignore'),'*.fixture\n');git(repo,['add','.gitignore']);
  git(repo,['-c','user.name=Test','-c','user.email=test@localhost','commit','-qm','initial']);
  await snapshotSource(repo,copy);assert.equal(await fs.readFile(join(copy,'versioned.fixture'),'utf8'),'needed');
});


test('deployment runs the entire contract suite once alongside native checks', async () => {
  const {validationCommands} = await import('../packages/gateway-rust/tooling/validation-commands.mjs');
  const root = fileURLToPath(new URL('../', import.meta.url));
  const targets = ['gateway_rust', 'local_deploy_pipeline', 'local_deploy_host'];
  const commands = validationCommands(root, targets, true);
  const contract = fileURLToPath(new URL('../tests/contract/run.mjs', import.meta.url));
  assert.deepEqual(commands.filter(([path]) => path === contract), [[contract, 'test']]);
  assert.deepEqual(commands.slice(0, 3).map(([, ...args]) => args), [
    ['fmt'], ['clippy', '--all-targets', '--', '-D', 'warnings'], ['test', '--lib'],
  ]);
  assert.deepEqual(validationCommands(root, targets).at(-1), [
    contract, 'test', ...targets.flatMap(target => ['--test', target]),
  ]);
});
