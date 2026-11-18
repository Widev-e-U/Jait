import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {validateReview} from './native-source-review.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex');
function fixture(){
 const files={'subject.ts':'export const real = true;','tests/contract/tests/native.rs':'fn actual_contract() {}'};
 const registry={schema_version:1,sources:[{path:'subject.ts',sha256:sha(files['subject.ts']),review:'Real contract and stated scope.',cases:[{id:'actual_contract',source:'tests/contract/tests/native.rs',target:'native'}]}]};
 files['tests/contract/reviews/native-source-reconciliation.json']=JSON.stringify(registry);
 const report={profile:'reviewed-native-reference-contracts',backend_label:'typescript',success:true,sources_unchanged:true,reviewed_sources:['subject.ts'],source_sha256:Object.fromEntries(Object.entries(files).map(([p,c])=>[p,sha(c)])),cases:[{id:'actual_contract',target:'native',status:'passed'}]};
 return {registry,report,files,read:p=>Buffer.from(files[p])};
}
test('accepts complete current bounded reference evidence',()=>{const f=fixture();assert.equal(validateReview(f.registry,f.report,f.read).length,1);});
test('rejects failed, missing, skipped or borrowed execution evidence',()=>{
 for(const change of [r=>r.success=false,r=>r.sources_unchanged=false,r=>r.backend_label='rust',r=>r.cases=[],r=>r.cases[0].status='skipped',r=>r.cases[0].target='other']){const f=fixture();change(f.report);assert.throws(()=>validateReview(f.registry,f.report,f.read));}
});
test('rejects stale source, test source and source registry',()=>{
 for(const path of ['subject.ts','tests/contract/tests/native.rs','tests/contract/reviews/native-source-reconciliation.json']){const f=fixture();f.files[path]+='changed';assert.throws(()=>validateReview(f.registry,f.report,f.read));}
});
