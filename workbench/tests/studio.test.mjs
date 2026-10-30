import {test} from 'node:test';
import assert from 'node:assert/strict';
import {consensusTarget,normalizeStudioTransaction,assertBrowserWalletTarget} from '../src/studio.ts';
import {receiptOutcome} from '../src/domain.ts';
const abi=[{type:'function',name:'addTransaction',inputs:['address','address','uint256','uint256','bytes'].map(type=>({type}))}];
test('use the Studio runtime target, including its zero simulator dispatcher, not stale SDK metadata',()=>{
  assert.equal(consensusTarget({address:'0x'+'0'.repeat(40),abi}),'0x'+'0'.repeat(40));
  assert.equal(consensusTarget({address:'0x'+'2'.repeat(40),abi}),'0x'+'2'.repeat(40));
  assert.throws(()=>consensusTarget({address:'0x'+'0'.repeat(40),abi:[]}));
  assert.throws(()=>consensusTarget({address:'0x1234',abi}));
});
test('a finalized transfer can never provide a contract address or deployment success',()=>{
  const t=normalizeStudioTransaction({type:0,status:'FINALIZED',recipient:'0x'+'2'.repeat(40),data:{},consensus_data:null,value:0});
  assert.equal(t.isContractTransaction,false);assert.equal(t.contract,undefined);assert.equal(receiptOutcome(t),'unknown');
});
test('zero simulator configuration remains readable but is never sent to a browser wallet',()=>{
  const target=consensusTarget({address:'0x'+'0'.repeat(40),abi});
  assert.throws(()=>assertBrowserWalletTarget(target),/External-wallet signing is blocked/);
  assert.doesNotThrow(()=>assertBrowserWalletTarget('0x'+'2'.repeat(40)));
});
test('read actual deployed contract from data and use first authoritative leader receipt',()=>{
  const t=normalizeStudioTransaction({type:1,status:'FINALIZED',data:{contract_address:'0x'+'3'.repeat(40)},consensus_data:{leader_receipt:[{execution_result:'SUCCESS'},{execution_result:'ERROR'}]}});
  assert.equal(t.contract,'0x'+'3'.repeat(40));assert.equal(receiptOutcome(t),'success');
});
test('missing execution never defaults to success; failed calls stay failed',()=>{
  const t=normalizeStudioTransaction({type:2,status:'FINALIZED',recipient:'0x'+'3'.repeat(40),consensus_data:{}});assert.equal(receiptOutcome(t),'unknown');
  const failed=normalizeStudioTransaction({type:2,status:'FINALIZED',recipient:'0x'+'3'.repeat(40),consensus_data:{leader_receipt:[{execution_result:'ERROR'}]}});assert.equal(receiptOutcome(failed),'failed');
  assert.throws(()=>normalizeStudioTransaction({status:'FINALIZED',type:99}));
});
