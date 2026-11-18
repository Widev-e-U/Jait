import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync, copyFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
const artifacts=fileURLToPath(new URL('../../../.jait/artifacts/parity-fragment-tests/',import.meta.url));
function fixture(run) {
  mkdirSync(artifacts,{recursive:true});
  const root=mkdtempSync(join(artifacts,'case-'));
  const contract=join(root,'tests/contract');
  mkdirSync(join(contract,'tooling'),{recursive:true});
  mkdirSync(join(contract,'fragments'));
  copyFileSync(fileURLToPath(new URL('./apply-fragments.mjs',import.meta.url)),join(contract,'tooling/apply-fragments.mjs'));
  const manifest={summary:{},test_files:[{cases:[{id:'active',status:'pending'}]}],retained_test_files:[{cases:[{id:'retained',status:'pending'}]}]};
  const write=()=>writeFileSync(join(contract,'coverage.json'),JSON.stringify(manifest));write();
  const entry=id=>({id,status:'verified',parity_review:'Reviewed source assertions and fixture boundary',rust_cases:[{id:'case.'+id,source:'tests/contract/tests/sample.rs',report:'.jait/artifacts/contracts/sample/report.json'}]});
  const fragment=entries=>writeFileSync(join(contract,'fragments/review.json'),JSON.stringify({declarations:entries}));
  const apply=()=>spawnSync(process.execPath,[join(contract,'tooling/apply-fragments.mjs')],{encoding:'utf8'});
  const contents=()=>readFileSync(join(contract,'coverage.json'),'utf8');
  try { run({manifest,write,entry,fragment,apply,contents}); } finally { rmSync(root,{recursive:true,force:true}); }
}
test('reviewed active and retained declarations apply once and preserve idempotence',()=>fixture(({entry,fragment,apply,contents})=>{
  fragment([entry('active'),entry('retained')]);
  const first=apply();assert.equal(first.status,0,first.stderr);
  const output=JSON.parse(contents());assert.equal(output.summary.rust_verified_declarations,2);
  assert.equal(output.retained_test_files[0].cases[0].status,'verified');
  const before=contents();const second=apply();assert.equal(second.status,0,second.stderr);assert.equal(contents(),before);
  assert.equal(JSON.parse(second.stdout).unchanged,2);
}));
test('unknown and duplicate fragment declarations fail before modifying inventory',()=>fixture(({entry,fragment,apply,contents})=>{
  const before=contents();fragment([entry('missing')]);assert.notEqual(apply().status,0);assert.equal(contents(),before);
  fragment([entry('retained'),entry('retained')]);assert.notEqual(apply().status,0);assert.equal(contents(),before);
}));
test('duplicate active/retained inventory identities cannot overwrite each other',()=>fixture(({manifest,write,entry,fragment,apply,contents})=>{
  manifest.retained_test_files[0].cases[0].id='active';write();const before=contents();
  fragment([entry('active')]);assert.notEqual(apply().status,0);assert.equal(contents(),before);
}));
