import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseCase, objectiveFindings, parseResult, address, hash, receiptOutcome, parseJournal} from '../src/domain.ts';
const raw=readFileSync(new URL('../public/fixtures/case.json',import.meta.url),'utf8');
const fixture=JSON.parse(raw);
const result=JSON.parse(readFileSync(new URL('../public/fixtures/demo-result.json',import.meta.url),'utf8')).assessment;
const clone=v=>structuredClone(v);
const input=change=>{const c=clone(fixture);change(c);return JSON.stringify(c);};
test('accept the reviewed synthetic case; preview C1/C2 without pretending to assess C3/C4',()=>{
  const c=parseCase(raw);assert.equal(c.case_id,'SYNTHETIC-WEBSITE-001');
  assert.deepEqual(objectiveFindings(c).map(x=>[x.criterion_id,x.status]),[['C1','met'],['C2','not_met']]);
});
test('missing timestamps and revision mismatch yield insufficient evidence',()=>{
  const c=parseCase(input(x=>{x.submitted_at=null;x.report.commit='a'.repeat(40);}));
  assert.deepEqual(objectiveFindings(c).map(x=>x.status),['insufficient_evidence','insufficient_evidence']);
});
test('deadline equality counts as on-time; all tests must pass',()=>{
  const c=parseCase(input(x=>{x.submitted_at=x.due_at;x.report.passed=x.report.total;}));
  assert.deepEqual(objectiveFindings(c).map(x=>x.status),['met','met']);
});
test('reject unknown top-level fields, duplicate IDs and irrelevant criteria',()=>{
  for(const change of [x=>x.extra=true,x=>x.evidence.push(clone(x.evidence[0])),x=>x.evidence[0].criteria=['C1'],x=>x.evidence[0].criteria=['C3','C3']]) assert.throws(()=>parseCase(input(change)));
});
test('reject malformed report and non-integer / boolean timestamps',()=>{
  for(const change of [x=>x.report.passed=x.report.total+1,x=>x.report.total=0,x=>x.due_at=true,x=>x.due_at=1.5,x=>x.delivery_commit='A'.repeat(40),x=>x.schema_version=true]) assert.throws(()=>parseCase(input(change)));
});
test('UTF-8 byte limit applies before parsing and matches the contract cap',()=>{
  const s=input(x=>x.dispute.agent='中'.repeat(7000));assert.ok(s.length<16000);assert.throws(()=>parseCase(s),/16,000/);
});
test('Unicode text lengths use code points; whitespace-only evidence fails',()=>{
  assert.doesNotThrow(()=>parseCase(input(x=>x.evidence[0].text='😀'.repeat(3000))));
  assert.throws(()=>parseCase(input(x=>x.evidence[0].text='😀'.repeat(3001))));
  assert.throws(()=>parseCase(input(x=>x.evidence[0].text='  \n ')));
});
test('recognize historical canned result only after validating case binding and references',()=>{
  assert.equal(parseResult(JSON.stringify(result),fixture).findings.length,4);
  const foreign=clone(result);foreign.case_id='OTHER';assert.throws(()=>parseResult(JSON.stringify(foreign),fixture));
});
test('reject forged citations, unrelated evidence and decisive results without evidence',()=>{
  for(const change of [x=>x.findings[2].evidence_ids=['fake'],x=>x.findings[2].evidence_ids=['E2'],x=>x.findings[2].evidence_ids=[],x=>x.findings[2].evidence_ids=['E1','E1']]){const r=clone(result);change(r);assert.throws(()=>parseResult(JSON.stringify(r),fixture));}
});
test('reject duplicate criteria and contradictory deterministic results',()=>{
  const duplicate=clone(result);duplicate.findings[2]=clone(duplicate.findings[3]);assert.throws(()=>parseResult(JSON.stringify(duplicate),fixture));
  const wrong=clone(result);wrong.findings[0].status='not_met';assert.throws(()=>parseResult(JSON.stringify(wrong),fixture));
});
test('transaction finality does not imply execution success',()=>{
  assert.equal(receiptOutcome({statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_ERROR'}),'failed');
  assert.equal(receiptOutcome({statusName:'FINALIZED',txExecutionResultName:'FINISHED_WITH_RETURN'}),'success');
  assert.equal(receiptOutcome({statusName:'ACCEPTED',txExecutionResultName:'FINISHED_WITH_RETURN'}),'pending');
  assert.equal(receiptOutcome({statusName:'FINALIZED'}),'unknown');
  assert.equal(receiptOutcome({statusName:'CANCELED'}),'failed');
});
test('validate nonzero contract addresses and full transaction hashes',()=>{
  assert.equal(address('0x'+'1'.repeat(40)),'0x'+'1'.repeat(40));assert.throws(()=>address('0x'+'0'.repeat(40)));assert.throws(()=>address('<script>'));
  assert.equal(hash('0x'+'a'.repeat(64)).length,66);assert.throws(()=>hash('0x123'));
});
test('transaction journal handles corrupt storage and excludes foreign networks / unsafe records',()=>{
  const valid={hash:'0x'+'a'.repeat(64),kind:'deploy',chainId:61999,account:'0x'+'1'.repeat(40),contract:'',createdAt:'2026-10-28T00:00:00Z',outcome:'pending'};
  assert.deepEqual(parseJournal('bad JSON'),[]);assert.deepEqual(parseJournal('{}'),[]);
  assert.deepEqual(parseJournal(JSON.stringify([valid,{...valid,chainId:4221},{...valid,hash:'<script>'},{...valid,outcome:'made up'}])),[valid]);
  assert.equal(parseJournal(JSON.stringify(Array(45).fill(valid))).length,40);
});
