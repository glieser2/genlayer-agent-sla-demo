// Public read-only inspection of a user-supplied Studio contract. Never signs or sends writes.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {address,parseCase,parseResult,receiptOutcome} from './src/domain.ts';
import {STUDIO_RPC,studioRpc,normalizeStudioTransaction} from './src/studio.ts';
const contract=address(process.argv[2]??'');
const client=createClient({chain:studionet});
const sha=s=>createHash('sha256').update(s).digest('hex');
const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
const summary={observedAt:new Date().toISOString(),contract,readOnly:true,transactionsSentByInspector:0};
const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Read-only request timed out')),20000))]);}finally{clearTimeout(timer);}};
try {
  summary.chainId=await bounded(client.getChainId());if(summary.chainId!==61999)throw new Error('Unexpected network');
  const code=await bounded(client.getContractCode(contract));
  summary.sourceSha256=sha(code);summary.sourceMatchesReviewed=code===readFileSync(new URL('./public/contracts/agent_sla.py',import.meta.url),'utf8');
  if(!summary.sourceMatchesReviewed)throw new Error('Deployed source mismatch; stop further writes');
  const snapshot=await bounded(client.readContract({address:contract,functionName:'get_snapshot',args:[]}));
  if(typeof snapshot!=='string')throw new Error('Invalid snapshot');
  const c=parseCase(snapshot);const fixture=parseCase(readFileSync(new URL('./public/fixtures/case.json',import.meta.url),'utf8'));
  summary.caseId=c.case_id;summary.snapshotSha256=sha(snapshot);summary.snapshotMatchesReviewedSyntheticCase=canonical(c)===canonical(fixture);
  if(!summary.snapshotMatchesReviewedSyntheticCase)throw new Error('Snapshot mismatch; stop further writes');
  const result=await bounded(client.readContract({address:contract,functionName:'get_result',args:[]}));
  if(typeof result!=='string')throw new Error('Invalid result');
  summary.assessmentPerformed=result!=='';if(result!=='')summary.assessment=parseResult(result,c);
  const response=await fetch(STUDIO_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'sim_getTransactionsForAddress',params:[contract]}),signal:AbortSignal.timeout(15000)});
  if(!response.ok)throw new Error('Transaction list HTTP '+response.status);
  const payload=await response.json();if(payload.error||!Array.isArray(payload.result))throw new Error('Invalid public transaction list');
  // Do not log or save raw receipts: they may contain irrelevant node configuration.
  summary.relatedTransactions=payload.result.map(t=>({hash:t.hash??t.transaction_hash,status:t.status,type:t.type,recipient:t.recipient,contractAddress:t.data?.contract_address}));
  const deploy=summary.relatedTransactions.filter(t=>Number(t.type)===1&&(t.contractAddress??t.recipient)?.toLowerCase()===contract.toLowerCase());
  if(deploy.length===1&&/^0x[0-9a-fA-F]{64}$/.test(deploy[0].hash??'')){
    const tx=normalizeStudioTransaction(await bounded(studioRpc('gen_getStudioTransactionByHash',[deploy[0].hash])));
    summary.deployment={transactionId:deploy[0].hash,status:tx.statusName,execution:tx.txExecutionResultName,outcome:receiptOutcome(tx),type:tx.transactionType,sender:tx.sender,contract:tx.contract};
    if(tx.transactionType!==1||tx.contract?.toLowerCase()!==contract.toLowerCase())throw new Error('Deployment receipt mismatch');
  }
  summary.explorer=`https://explorer-studio.genlayer.com/address/${contract}`;
}catch(e){summary.error=e.message;}
console.log(JSON.stringify(summary,null,2));
if(process.argv.includes('--record'))writeFileSync(new URL(`./docs/contract-${contract.toLowerCase()}.json`,import.meta.url),JSON.stringify(summary,null,2)+'\n');
process.exit(summary.error?1:0);
