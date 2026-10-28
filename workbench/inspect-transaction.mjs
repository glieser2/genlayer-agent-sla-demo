// Read-only inspection of an explicitly supplied transaction; never sends a write.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync} from 'node:fs';
import {hash, address, parseCase, parseResult, receiptOutcome} from './src/domain.ts';
import {studioRpc,normalizeStudioTransaction} from './src/studio.ts';
const id=hash(process.argv[2]??'');
const client=createClient({chain:studionet});
const sha=s=>createHash('sha256').update(s).digest('hex');
const summary={observedAt:new Date().toISOString(),chainId:studionet.id,transactionId:id,readOnly:true,transactionsSentByInspector:0};
const bounded=async p=>{let timer;try{return await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Read-only request timed out')),20000))]);}finally{clearTimeout(timer);}};
try {
  const chainId=await bounded(client.getChainId());if(chainId!==61999)throw new Error('Unexpected network');
  const tx=normalizeStudioTransaction(await bounded(studioRpc('gen_getStudioTransactionByHash',[id])));
  summary.status=tx.statusName??tx.status;summary.execution=tx.txExecutionResultName??tx.txExecutionResult;
  summary.outcome=tx.isContractTransaction?receiptOutcome(tx):'wrong_type';summary.sender=tx.sender;
  summary.transactionType=tx.transactionType;summary.value=tx.value;
  const candidate=tx.contract;
  if(candidate && !/^0x0{40}$/i.test(candidate))summary.contract=address(candidate);
  if(summary.outcome==='success' && summary.contract) {
    const code=await bounded(client.getContractCode(summary.contract));
    summary.sourceSha256=sha(code);
    summary.sourceMatchesReviewed=code===readFileSync(new URL('./public/contracts/agent_sla.py',import.meta.url),'utf8');
    if(!summary.sourceMatchesReviewed)throw new Error('Deployed source mismatch; stop further writes');
    const snapshot=await bounded(client.readContract({address:summary.contract,functionName:'get_snapshot',args:[]}));
    if(typeof snapshot!=='string')throw new Error('Invalid snapshot');
    const c=parseCase(snapshot);const fixture=parseCase(readFileSync(new URL('./public/fixtures/case.json',import.meta.url),'utf8'));
    const canonical=v=>JSON.stringify(v && typeof v==='object' ? Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])) : v);
    summary.caseId=c.case_id;summary.snapshotSha256=sha(snapshot);summary.snapshotMatchesReviewedSyntheticCase=canonical(c)===canonical(fixture);
    const result=await bounded(client.readContract({address:summary.contract,functionName:'get_result',args:[]}));
    summary.assessmentPerformed=result!=='';
    if(result!=='')summary.assessment=parseResult(result,c);
    summary.explorer=`https://explorer-studio.genlayer.com/address/${summary.contract}`;
  }
} catch(e) {summary.error=e.message;}
console.log(JSON.stringify(summary,null,2));
if(process.argv.includes('--record'))writeFileSync(new URL(`./docs/transaction-${id}.json`,import.meta.url),JSON.stringify(summary,null,2)+'\n');
process.exit(summary.error?1:0);
