// Fully offline: real pinned SDK, fake local account, fake signature bytes and RPC.
// No createAccount()/key generation or real transaction is executed by these tests.
import {test,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {abi,decodeInputData} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createStudioSession} from '../src/studio-session.ts';
import {makeWriter} from '../src/network.ts';
import {consensusTarget} from '../src/studio.ts';
const require=createRequire(import.meta.resolve('genlayer-js'));
const {decodeFunctionData,encodeEventTopics,encodeAbiParameters,fromRlp,hexToBytes,bytesToHex}=require('viem');
const ZERO='0x'+'0'.repeat(40), ACCOUNT='0x'+'1'.repeat(40), CONTRACT='0x'+'3'.repeat(40);
const code=readFileSync(new URL('../public/contracts/agent_sla.py',import.meta.url),'utf8');
const snapshot=readFileSync(new URL('../public/fixtures/case.json',import.meta.url),'utf8');
const deploy={kind:'deploy',code,snapshot,contract:''};
const assess={kind:'assess',code,snapshot,contract:CONTRACT};
const expectedAbi=[{type:'function',name:'addTransaction',inputs:['address','address','uint256','uint256','bytes'].map(type=>({type}))}];
const eventAbi=[{type:'event',name:'CreatedTransaction',inputs:[{name:'txId',type:'bytes32',indexed:true},{name:'txSlot',type:'uint256',indexed:false}]}];
const originalFetch=globalThis.fetch;
afterEach(()=>{globalThis.fetch=originalFetch;});
function harness() {
  const state={chain:'0xf22f',target:ZERO,abi:expectedAbi,gas:'0x0',sdkGas:'0x0',now:1000,creates:0,signed:[],broadcast:[],methods:[],receipts:new Map(),failBroadcast:false,omitEvent:false,snapshot,result:'',code,mutateBeforeSign:null,mutateOnSign:null};
  const id=n=>'0x'+n.toString(16).padStart(64,'0');
  const rpc=async(method,params)=>{
    if(method==='eth_chainId')return state.chain;
    if(method==='eth_gasPrice')return state.gas;
    if(method==='sim_getConsensusContract')return {address:state.target,abi:state.abi};
    if(method==='gen_getStudioTransactionByHash')return state.receipts.get(params[0]);
    throw new Error('Unmocked guard RPC: '+method);
  };
  globalThis.fetch=async (url,options)=>{
    assert.equal(String(url),'https://studio.genlayer.com/api','all remote traffic must be intercepted');
    const request=JSON.parse(options.body);
    async function respond(r) {
      state.methods.push(r.method);let result;
      switch(r.method) {
        case 'sim_getConsensusContract':result={address:state.target,abi:state.abi};break;
        case 'eth_chainId':result=state.chain;break;
        case 'eth_getTransactionCount':result='0x'+state.broadcast.length.toString(16);break;
        case 'eth_estimateGas':result='0x30d40';if(state.mutateBeforeSign)state.mutateBeforeSign();break;
        case 'eth_gasPrice':result=state.sdkGas;break;
        case 'eth_blockNumber':result='0x1';break;
        case 'eth_sendRawTransaction':
          state.broadcast.push(r.params[0]);
          if(state.failBroadcast)return {jsonrpc:'2.0',id:r.id,error:{code:-32602,message:'TEST ambiguous broadcast; invalid pointer'}};
          result=id(state.broadcast.length);break;
        case 'eth_getTransactionReceipt': {
          const txId=r.params[0], kind=state.receipts.size===0?1:2;
          state.receipts.set(txId,{status:'FINALIZED',type:kind,sender:ACCOUNT,value:0,data:{contract_address:CONTRACT},recipient:CONTRACT,consensus_data:{leader_receipt:[{execution_result:'SUCCESS'}]}});
          result={transactionHash:txId,transactionIndex:'0x0',blockHash:id(999),blockNumber:'0x1',from:ACCOUNT,to:ZERO,cumulativeGasUsed:'0x1',gasUsed:'0x1',effectiveGasPrice:'0x0',contractAddress:null,status:'0x1',type:'0x0',logsBloom:'0x'+'0'.repeat(512),logs:state.omitEvent?[]:[{address:ZERO,blockHash:id(999),blockNumber:'0x1',transactionHash:txId,transactionIndex:'0x0',logIndex:'0x0',removed:false,topics:encodeEventTopics({abi:eventAbi,eventName:'CreatedTransaction',args:{txId}}),data:encodeAbiParameters([{type:'uint256'}],[1n])}]};break;
        }
        case 'gen_getContractCode':result=Buffer.from(state.code).toString('base64');break;
        case 'gen_call': {
          const call=abi.calldata.decode(hexToBytes(fromRlp(r.params[0].data)[0]));
          const method=call.get('method');
          assert.ok(['get_snapshot','get_result'].includes(method));
          result=bytesToHex(abi.calldata.encode(method==='get_snapshot'?state.snapshot:state.result)).slice(2);break;
        }
        default:throw new Error('Unmocked SDK RPC (network blocked): '+r.method);
      }
      return {jsonrpc:'2.0',id:r.id,result};
    }
    return new Response(JSON.stringify(Array.isArray(request)?await Promise.all(request.map(respond)):await respond(request)),{status:200,headers:{'Content-Type':'application/json'}});
  };
  const session=createStudioSession({rpc,now:()=>state.now,newAccount:()=>{
    state.creates++;
    return {address:ACCOUNT,type:'local',source:'custom',publicKey:'0x',signTransaction:async tx=>{
      state.signed.push(tx);if(state.mutateOnSign)state.mutateOnSign();
      return '0x0102'; // Deliberately invalid signature: only the fake RPC accepts it.
    }};
  }});
  return {state,session};
}
async function deployed(h) {await h.session.start(true);const q=await h.session.prepare(deploy);return h.session.submit(q,true);}

test('session creation is explicit, lazy, memory-only, and checks chain/ABI before account factory',async()=>{
  const {state,session}=harness();assert.equal(state.creates,0);
  await assert.rejects(session.start(false),/先确认/);assert.equal(state.creates,0);
  state.chain='0x1';await assert.rejects(session.start(true),/网络身份/);assert.equal(state.creates,0);
  state.chain='0xf22f';state.abi=[];await assert.rejects(session.start(true),/ABI/);assert.equal(state.creates,0);
  state.abi=expectedAbi;assert.equal(await session.start(true),ACCOUNT);await session.start(true);assert.equal(state.creates,1);
  session.end();assert.equal(session.address,undefined);assert.equal(state.signed.length,0);
});
test('actual SDK completes mocked zero-dispatcher deploy then assess with exact source, snapshot, sender and function',async()=>{
  const h=harness();await deployed(h);
  const q=await h.session.prepare(assess);await h.session.submit(q,true);
  assert.equal(h.state.signed.length,2);assert.equal(h.state.broadcast.length,2);
  for(const tx of h.state.signed){assert.equal(tx.chainId,61999);assert.equal(tx.to,ZERO);assert.equal(tx.value,0n);assert.equal(tx.gasPrice,0n);assert.equal(tx.account.address,ACCOUNT);}
  const [deployment,assessment]=h.state.signed.map(tx=>decodeFunctionData({abi:studionet.consensusMainContract.abi,data:tx.data}));
  assert.equal(deployment.functionName,'addTransaction');assert.equal(deployment.args[0],ACCOUNT);assert.equal(deployment.args[1],ZERO);
  const d=decodeInputData(deployment.args[4],ZERO);assert.equal(d.type,'deploy');assert.equal(d.code,code);assert.deepEqual(d.constructorArgs.get('args'),[snapshot]);assert.equal(d.leaderOnly,false);
  assert.equal(assessment.args[0],ACCOUNT);assert.equal(assessment.args[1],CONTRACT);
  const a=decodeInputData(assessment.args[4],CONTRACT);assert.equal(a.type,'call');assert.equal(a.callData.get('method'),'assess');assert.deepEqual(a.callData.get('args')??[],[]);assert.equal(a.leaderOnly,false);
  assert.ok(!h.state.methods.includes('eth_sendTransaction'),'never asks an external wallet');
});
test('external browser-wallet zero-address protection stays intact',async()=>{
  const h=harness();let calls=0;
  await assert.rejects(makeWriter(ACCOUNT,{request:async()=>{calls++;throw new Error('should not reach wallet');}}),/停止向浏览器钱包/);
  assert.equal(calls,0);assert.equal(h.state.signed.length,0);
});
test('ABI ambiguity and v6 ABI changes are rejected',()=>{
  assert.throws(()=>consensusTarget({address:ZERO,abi:[...expectedAbi,...expectedAbi]}),/ABI/);
  assert.throws(()=>consensusTarget({address:ZERO,abi:[{...expectedAbi[0],inputs:[...expectedAbi[0].inputs,{type:'uint256'}]}]}),/ABI/);
});
test('changed chain, dispatcher and ABI after review never reach signing',async()=>{
  for(const mutate of [s=>s.chain='0x1',s=>s.target='0x'+'2'.repeat(40),s=>s.abi=[]]) {
    const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);mutate(h.state);
    await assert.rejects(h.session.submit(q,true));assert.equal(h.state.signed.length,0);assert.equal(h.state.broadcast.length,0);
  }
});
test('late configuration drift during SDK gas estimation is rechecked before signing',async()=>{
  const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);
  h.state.mutateBeforeSign=()=>{h.state.target='0x'+'2'.repeat(40);};
  await assert.rejects(h.session.submit(q,true),/派发目标/);assert.equal(h.state.signed.length,0);
});
test('nonzero SDK gas price and changed preflight gas price fail closed',async()=>{
  for(const field of ['sdkGas','gas']){
    const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);h.state[field]='0x1';
    await assert.rejects(h.session.submit(q,true));assert.equal(h.state.signed.length,0);
  }
});
test('review requires confirmation, cannot be forged or reused, and expires',async()=>{
  const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);
  await assert.rejects(h.session.submit(q,false),/明确确认/);
  await assert.rejects(h.session.submit({...q},true),/复核已使用/);
  h.state.now+=300001;await assert.rejects(h.session.submit(q,true),/失效/);
  await assert.rejects(h.session.submit(q,true),/复核已使用/);assert.equal(h.state.signed.length,0);
});
test('duplicate concurrent submit signs once and old account review cannot sign',async()=>{
  const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);
  const first=h.session.submit(q,true);await assert.rejects(h.session.submit(q,true),/复核已使用/);await first;
  assert.equal(h.state.signed.length,1);
  const h2=harness();await h2.session.start(true);const q2=await h2.session.prepare(deploy);h2.session.end();await h2.session.start(true);
  await assert.rejects(h2.session.submit(q2,true),/失效/);assert.equal(h2.state.signed.length,0);
});
test('pending, wrong sender/type and failed deployment cannot authorize assess',async()=>{
  for(const mutate of [r=>r.status='PENDING',r=>r.sender=CONTRACT,r=>r.type=0,r=>r.consensus_data.leader_receipt[0].execution_result='ERROR']) {
    const h=harness();const id=await deployed(h);mutate(h.state.receipts.get(id));
    await assert.rejects(h.session.prepare(assess));assert.equal(h.state.signed.length,1);
  }
});
test('assess rejects unrelated owner and changed source, snapshot or completed result',async()=>{
  const h=harness();await h.session.start(true);await assert.rejects(h.session.prepare(assess),/本页临时账户已确认部署/);
  for(const [mutate,reason] of [[s=>s.code+='\n',/源码校验/],[s=>s.snapshot+=' ',/证据包与复核/],[s=>s.result='already assessed',/已有结果/]]) {
    const h=harness();await deployed(h);mutate(h.state);await assert.rejects(h.session.prepare(assess),reason);assert.equal(h.state.signed.length,1);
  }
});
test('source edits and malformed evidence are rejected before signer',async()=>{
  const h=harness();await h.session.start(true);
  await assert.rejects(h.session.prepare({...deploy,code:code+'\n'}),/源码/);
  await assert.rejects(h.session.prepare({...deploy,snapshot:'{}'}));assert.equal(h.state.signed.length,0);
});
test('missing consensus event is ambiguous, never success; subsequent signing is blocked',async()=>{
  const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);h.state.omitEvent=true;
  await assert.rejects(h.session.submit(q,true),/no NewTransaction or CreatedTransaction/);
  assert.equal(h.session.uncertain,true);await assert.rejects(h.session.prepare(deploy),/广播状态未知/);
  h.session.end();await assert.rejects(h.session.start(true),/广播状态未知/);assert.equal(h.state.signed.length,1);
});
test('SDK ABI retry cannot produce a second signature after ambiguous send',async()=>{
  const h=harness();await h.session.start(true);const q=await h.session.prepare(deploy);h.state.failBroadcast=true;
  await assert.rejects(h.session.submit(q,true));assert.equal(h.state.signed.length,1);assert.equal(h.session.uncertain,true);
});
test('caller mutation during preparation cannot change the reviewed source or snapshot',async()=>{
  const h=harness();await h.session.start(true);const input={...deploy};const pending=h.session.prepare(input);
  input.code='tampered';input.snapshot='{}';input.contract=CONTRACT;
  const q=await pending;assert.equal(q.code,code);assert.equal(q.snapshot,snapshot);assert.equal(q.contract,'');
  assert.ok(Object.isFrozen(q));assert.equal(h.state.signed.length,0);
});
test('assess rechecks the frozen snapshot and existing result at submission',async()=>{
  for(const [mutate,reason] of [[s=>s.snapshot+=' ',/证据包与复核/],[s=>s.result='already assessed',/已有结果/]]) {
    const h=harness();await deployed(h);const q=await h.session.prepare(assess);mutate(h.state);
    await assert.rejects(h.session.submit(q,true),reason);assert.equal(h.state.signed.length,1);
  }
});
