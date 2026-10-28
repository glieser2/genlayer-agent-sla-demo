// Explicit, read-only compatibility probe. Does not connect a wallet or send transactions.
import {createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {readFileSync,writeFileSync} from 'node:fs';
import {studioRpc,consensusTarget} from './src/studio.ts';
const chain=studionet;
const summary={observedAt:new Date().toISOString(),sdk:'1.1.8',network:chain.name,expectedChainId:chain.id,rpc:chain.rpcUrls.default.http[0],readOnly:true,walletConnected:false,transactionsSent:0};
const client=createClient({chain});
const timeout=async promise=>{let timer;try{return await Promise.race([promise,new Promise((_,reject)=>timer=setTimeout(()=>reject(new Error('Read-only probe timed out after 15 seconds')),15000))]);}finally{clearTimeout(timer);}};
try {
  summary.actualChainId=await timeout(client.getChainId());
  if(summary.actualChainId!==chain.id)throw new Error('Unexpected network identity');
  summary.sdkConsensusTarget=chain.consensusMainContract.address;
  summary.runtimeConsensusTarget=consensusTarget(await timeout(studioRpc('sim_getConsensusContract',['ConsensusMain'])));
  summary.staticSdkTargetMatchesRuntime=summary.sdkConsensusTarget.toLowerCase()===summary.runtimeConsensusTarget.toLowerCase();
  summary.writerUsesRuntimeTarget=true;
  const code=readFileSync(new URL('./public/contracts/agent_sla.py',import.meta.url),'utf8');
  const schema=await timeout(client.getContractSchemaForCode(code));
  summary.schemaMethods=Object.keys(schema.methods??{});
  summary.schemaCompatible=['assess','get_snapshot','get_result'].every(x=>summary.schemaMethods.includes(x));
} catch(e) { summary.error=e.message; }
if(process.argv.includes('--record'))writeFileSync(new URL('./docs/network-check.json',import.meta.url),JSON.stringify(summary,null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
process.exit(summary.error || !summary.schemaCompatible ? 1 : 0);
