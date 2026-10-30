import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createEvidenceReview} from '../src/evidence-review.ts';

const receipt=(origin='local_preview')=>({origin,caseId:'SYNTHETIC-WEBSITE-001',snapshotSha256:'a'.repeat(64),observedAt:'2026-10-31T00:00:00.000Z',
  ...(origin.startsWith('chain_')?{chainId:61999,contract:'0x'+'1'.repeat(40),sourceSha256:'b'.repeat(64)}:{})});

test('bind each accepted review to a source fingerprint and page revision',()=>{
 const state=createEvidenceReview();assert.equal(state.current,null);
 const token=state.begin();assert.equal(state.accept(token,receipt('chain_result')),true);
 assert.equal(state.current.snapshotSha256,'a'.repeat(64));assert.equal(state.current.revision,1);
 assert.equal(state.current.contract,'0x'+'1'.repeat(40));assert.equal(state.isCurrent(token),false);
});
test('provenance uses the same Unicode code-point limit as validated case IDs',()=>{
 const state=createEvidenceReview();
 assert.equal(state.accept(state.begin(),{...receipt(),caseId:'\u{1F4C4}'.repeat(80)}),true);
 assert.throws(()=>state.accept(state.begin(),{...receipt(),caseId:'\u{1F4C4}'.repeat(81)}),/metadata/);
});
test('editing or replacing evidence clears the current proof and marks history non-current',()=>{
 const state=createEvidenceReview();state.accept(state.begin(),receipt('chain_result'));state.changed();
 assert.equal(state.current,null);assert.equal(state.exportMetadata().current,null);
 assert.equal(state.exportMetadata().draftRevision,2);assert.equal(state.exportMetadata().history[0].current,false);
});
test('an in-flight chain read cannot overwrite a draft edited during network work',async()=>{
 const state=createEvidenceReview();let finish;const pending=new Promise(resolve=>{finish=resolve;});
 const token=state.begin();const apply=pending.then(()=>state.accept(token,receipt('chain_result')));
 state.changed();finish();assert.equal(await apply,false);assert.equal(state.current,null);
 assert.deepEqual(state.exportMetadata().history,[]);
});
test('switching targets, including switching away and back, invalidates the prior request',()=>{
 const state=createEvidenceReview(),token=state.begin();state.changed();state.changed();
 assert.equal(state.accept(token,receipt('chain_result')),false);
});
test('only the newest request can publish even when replies return out of order',()=>{
 const state=createEvidenceReview(),older=state.begin(),newer=state.begin();
 assert.equal(state.accept(older,receipt()),false);assert.equal(state.accept(newer,receipt('chain_result')),true);
 assert.equal(state.accept(older,receipt()),false);assert.equal(state.current.origin,'chain_result');
});
test('consumed and forged tickets cannot publish a result',()=>{
 const state=createEvidenceReview(),token=state.begin();
 assert.equal(state.accept({...token},receipt()),false);assert.equal(state.accept(token,receipt()),true);
 assert.equal(state.accept(token,receipt()),false);
});
test('local previews and fixed examples cannot carry an on-chain origin',()=>{
 const state=createEvidenceReview();assert.throws(()=>state.accept(state.begin(),{...receipt(),contract:'0x'+'1'.repeat(40)}),/cannot claim/);
 assert.equal(state.accept(state.begin(),receipt('synthetic_example')),true);
 assert.equal(state.current.origin,'synthetic_example');assert.equal(state.current.contract,undefined);
});
test('chain results require the pinned chain, nonzero address and both valid hashes',()=>{
 for(const change of [{chainId:4221},{contract:'0x'+'0'.repeat(40)},{sourceSha256:''},{snapshotSha256:'invalid'}]){
  const state=createEvidenceReview();assert.throws(()=>state.accept(state.begin(),{...receipt('chain_result'),...change}));
  assert.equal(state.current,null);assert.deepEqual(state.exportMetadata().history,[]);
 }
});
test('export is detached, bounded and contains no caller evidence text or key fields',()=>{
 const state=createEvidenceReview();const input={...receipt(),evidence:'PRIVATE_FIXTURE_DO_NOT_EXPORT',privateKey:'FAKE_PRIVATE_KEY'};
 state.accept(state.begin(),input);input.caseId='MUTATED';const view=state.current;view.caseId='MUTATED_VIEW';
 const exported=state.exportMetadata();exported.history[0].caseId='MUTATED_EXPORT';
 assert.equal(state.current.caseId,'SYNTHETIC-WEBSITE-001');assert.doesNotMatch(JSON.stringify(state.exportMetadata()),/PRIVATE|MUTATED/);
 for(let i=0;i<12;i++){state.changed();state.accept(state.begin(),receipt());}
 assert.equal(state.exportMetadata().history.length,10);assert.equal(state.exportMetadata().history.filter(x=>x.current).length,1);
});
