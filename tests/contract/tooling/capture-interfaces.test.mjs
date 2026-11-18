import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { capture, scan, root, directories, extraFiles, fingerprint, claimsDigest, claimKeys } from './capture-interfaces.mjs';
let next=0;
function fixture() {
 const base=path.join(root,'.jait/artifacts/rust-continuation/interfaces/author-fixtures',`${process.pid}-${next++}`);
 directories.forEach(d=>fs.mkdirSync(path.join(base,d),{recursive:true}));
 extraFiles.forEach(f=>fs.writeFileSync(path.join(base,f),'{}'));
 return base;
}
test('AST captures methods/schema expressions without executing source or matching comments',()=>{
 const source=`// app.delete('/comment-only', bad)
 const decoy = "app.post('/string-only', bad)";
 const bomb = (() => { throw new Error('NEVER EXECUTE'); })();
 app.get('/a', {schema: {querystring: RequestSchema}}, handler);
 app.route({method: ['POST','PUT'], url: '/b', schema: ResponseSchema, handler});
 app.post(prefix + '/dynamic', handler);
 registry.register({name: 'tools.safe', parameters: {type: 'object'}, execute: handler});
 `;
 const c=scan(source,'packages/gateway/src/routes/example.ts');
 const routes=c.filter(c=>c.kind==='route');
 assert.equal(routes.length,3);
 assert.deepEqual(routes.map(r=>r.details.methods),['GET',"['POST','PUT']",'POST']);
 assert.equal(routes[0].details.schema,'{querystring: RequestSchema}');
 assert.equal(routes[2].name,'<dynamic>');
 assert.equal(c.find(c=>c.kind==='tool').name,'tools.safe');
 assert.ok(c.every(c=>c.status==='pending' && c.required_test_ids.length===0 && c.gap));
 for (const claim of c) assert.equal(fingerprint(Buffer.from(source).subarray(claim.start,claim.end)),claim.fingerprint);
});
test('captures UTF-8 byte spans, events, env/config, DB versions and platform observations',()=>{
 const source=`const unicode='é😀';
 type WsEventType = 'chat.created' | 'chat.deleted';
 interface AppConfig { port: number; }
 const env=process.env['JAIT_PORT'];
 const t=sqliteTable('sessions',{id:text('id')});
 const migrations=[{id: 76,name: 'next',up:run}];
 const payload={type: \`chat.\${action}\`};
 const os='linux';`;
 const c=scan(source,'packages/shared/src/db/migrations.ts');
 for(const kind of ['ws_event','config','schema','db_table','db_migration','platform']) assert.ok(c.some(c=>c.kind===kind),kind);
 assert.equal(c.find(c=>c.kind==='db_migration').details.version,'76');
 assert.ok(c.some(c=>c.name==='<dynamic>' && c.kind==='ws_event'));
 for(const claim of c) assert.equal(fingerprint(Buffer.from(source).subarray(claim.start,claim.end)),claim.fingerprint);
});
test('deterministic capture pins all runtime sources, assets and dependency/bin metadata',()=>{
 const base=fixture();
 fs.writeFileSync(path.join(base,'packages/shared/src/new.ts'),'export interface Wire {value:string}');
 fs.writeFileSync(path.join(base,'packages/gateway/src/asset.sh'),'#!/bin/sh\necho safe');
 fs.writeFileSync(path.join(base,'packages/gateway/src/a.test.ts'),'throw new Error("not runtime")');
 fs.writeFileSync(path.join(base,'packages/gateway/package.json'),JSON.stringify({dependencies:{native:'1.2.3'},bin:{jait:'bin/main.mjs'}}));
 const a=capture(base);
 assert.deepEqual(a,capture(base));
 assert.ok(a.files.some(f=>f.path==='packages/shared/src/new.ts'));
 assert.ok(!a.files.some(f=>f.path.endsWith('a.test.ts')));
 for(const f of a.files) {
  assert.ok(f.migration_owner && f.gap && f.status==='pending');
  assert.equal(f.claims_fingerprint,claimsDigest(f.claims));
  for(const claim of f.claims) assert.deepEqual(Object.keys(claim),claimKeys);
 }
 for(const kind of ['asset','cli','dependency']) assert.ok(a.files.flatMap(f=>f.claims).some(c=>c.kind===kind));
 assert.equal(a.category_gaps.length,a.categories.length);
});
test('new interfaces/files and changed/removed sources change the baseline; no silent recapture in check mode',()=>{
 const base=fixture(), p=path.join(base,'packages/gateway/src/a.ts');
 fs.writeFileSync(p,"app.get('/a',handler)");
 const before=JSON.stringify(capture(base));
 fs.writeFileSync(p,"app.delete('/injected',handler)");
 assert.notEqual(JSON.stringify(capture(base)),before);
 fs.writeFileSync(path.join(base,'packages/shared/src/new.ts'),'export {}');
 assert.notEqual(JSON.stringify(capture(base)),before);
 fs.unlinkSync(p);
 assert.ok(!capture(base).files.some(f=>f.path.endsWith('/a.ts')));
});
test('rejects malformed source/package and symlink inputs; injected text remains inert',()=>{
 assert.throws(()=>scan('const = ;','packages/gateway/src/bad.ts'),/parse diagnostics/);
 const base=fixture();
 fs.writeFileSync(path.join(base,extraFiles[0]),'{bad');
 assert.throws(()=>capture(base));
 fs.writeFileSync(path.join(base,extraFiles[0]),'{}');
 fs.writeFileSync(path.join(base,'packages/gateway/src/a.ts'),"app.get('$(touch INJECTED)',handler)");
 const c=capture(base);
 assert.ok(c.files.flatMap(f=>f.claims).some(c=>c.name==='$(touch INJECTED)'));
 assert.ok(!fs.existsSync(path.join(base,'INJECTED')));
 if(process.platform!=='win32') {
  fs.symlinkSync(path.join(base,extraFiles[0]),path.join(base,'packages/shared/src/link.ts'));
  assert.throws(()=>capture(base),/symlink forbidden/);
 }
});
