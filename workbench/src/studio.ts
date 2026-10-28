// Only public read methods; this module never submits a transaction.
export const STUDIO_RPC='https://studio.genlayer.com/api';
export async function studioRpc(method:'sim_getConsensusContract'|'gen_getStudioTransactionByHash',params:unknown[]) {
  const r=await fetch(STUDIO_RPC,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw new Error(`Studio RPC HTTP ${r.status}`);
  const v=await r.json();if(v.error)throw new Error(`Studio RPC: ${v.error.message??'unknown error'}`);return v.result as unknown;
}
const object=(v:unknown):v is Record<string,unknown>=>!!v&&typeof v==='object'&&!Array.isArray(v);
export function consensusTarget(v:unknown):`0x${string}` {
  if(!object(v)||typeof v.address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(v.address)||!Array.isArray(v.abi))throw new Error('Studio 共识配置无效，已停止签名。');
  const ok=v.abi.some(f=>object(f)&&f.type==='function'&&f.name==='addTransaction'&&Array.isArray(f.inputs)&&f.inputs.map(i=>object(i)?i.type:'').join(',')==='address,address,uint256,uint256,bytes');
  if(!ok)throw new Error('Studio 当前交易 ABI 与固定 SDK 不匹配，已停止签名。');
  // Zero is the official Studio simulator's dispatch address; only chain 61999.
  return v.address as `0x${string}`;
}
export function assertBrowserWalletTarget(target:`0x${string}`) {
  if(/^0x0{40}$/i.test(target))throw new Error('当前 Studio 使用零地址派发交易，本应用已停止向浏览器钱包请求签名。请保留当前账户与网络，先核对官方支持的部署方式；无需充值或关闭钱包安全提醒。');
}
export function normalizeStudioTransaction(v:unknown) {
  if(!object(v)||typeof v.status!=='string'||![0,1,2].includes(Number(v.type)))throw new Error('Studio 交易详情格式无效。');
  const data=object(v.data)?v.data:{};const consensus=object(v.consensus_data)?v.consensus_data:{};
  const receipt=Array.isArray(consensus.leader_receipt)?consensus.leader_receipt[0]:consensus.leader_receipt;
  const execution=object(receipt)?receipt.execution_result:undefined;
  const contract=Number(v.type)===1?data.contract_address:Number(v.type)===2?v.recipient:undefined;
  return {statusName:v.status,txExecutionResultName:execution==='SUCCESS'?'FINISHED_WITH_RETURN':execution==='ERROR'?'FINISHED_WITH_ERROR':undefined,transactionType:Number(v.type),contract:typeof contract==='string'&&/^0x[0-9a-fA-F]{40}$/.test(contract)&&!/^0x0{40}$/.test(contract)?contract as `0x${string}`:undefined,sender:typeof v.sender==='string'?v.sender:undefined,value:typeof v.value==='number'||typeof v.value==='string'?v.value:undefined,isContractTransaction:Number(v.type)===1||Number(v.type)===2};
}
