import {createAccount, createClient} from 'genlayer-js';
import {studionet} from 'genlayer-js/chains';
import {address, hash, parseCase, receiptOutcome} from './domain.ts';
import {STUDIO_RPC, studioRpc, consensusTarget, normalizeStudioTransaction} from './studio.ts';

export const REVIEWED_SOURCE_SHA256='9bab25a9f898d20ec6af13f0e34aa19d395998f973a592d379726e48304dd912';
type LocalAccount=ReturnType<typeof createAccount>;
type Rpc=typeof studioRpc;
export type SessionOperation={kind:'deploy'|'assess';code:string;snapshot:string;contract:string};
export type SessionReview=Readonly<SessionOperation & {account:`0x${string}`;target:`0x${string}`;at:number}>;
const digest=async (s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),b=>b.toString(16).padStart(2,'0')).join('');

// Only start(true), called by the explicit UI control, creates an account.
// No key import/export, persistence, wallet provider or configurable network.
// The injected account and RPC are used only by isolated source-level tests.
export function createStudioSession(deps:{rpc?:Rpc;newAccount?:()=>LocalAccount;now?:()=>number}={}) {
  const rpc=deps.rpc??studioRpc, newAccount=deps.newAccount??createAccount, now=deps.now??Date.now;
  let account:LocalAccount|null=null, generation=0, busy=false, uncertain=false;
  const reviews=new WeakMap<SessionReview,number>();
  const sent:Array<{hash:`0x${string}`;kind:'deploy'|'assess';contract?:string;outcome:string}>=[];
  async function preflight(expected?:string) {
    if(studionet.id!==61999||studionet.rpcUrls.default.http[0]!==STUDIO_RPC)throw new Error('测试账户仅允许固定的官方 Studionet RPC。');
    if(Number(await rpc('eth_chainId',[]))!==61999)throw new Error('测试账户网络身份不匹配，已停止。');
    const target=consensusTarget(await rpc('sim_getConsensusContract',['ConsensusMain']));
    if(expected&&target.toLowerCase()!==expected.toLowerCase())throw new Error('Studio 派发目标已变化，请重新准备。');
    if(BigInt(String(await rpc('eth_gasPrice',[])))!==0n)throw new Error('临时测试账户仅支持零 gasPrice 的 Studionet，本次已停止。');
    return target;
  }
  function current(a:LocalAccount, g:number) {
    if(account!==a||generation!==g)throw new Error('临时账户已结束或改变，请重新准备。');
  }
  async function refresh(a:LocalAccount) {
    for(const entry of sent.filter(e=>['pending','unknown'].includes(e.outcome))) {
      const tx=normalizeStudioTransaction(await rpc('gen_getStudioTransactionByHash',[entry.hash]));
      if(tx.sender?.toLowerCase()!==a.address.toLowerCase()||tx.transactionType!==(entry.kind==='deploy'?1:2)||String(tx.value)!=='0')throw new Error('测试交易回执的发送者、类型或金额不符。');
      entry.outcome=receiptOutcome(tx);entry.contract=tx.contract;
    }
    if(sent.some(e=>['pending','unknown'].includes(e.outcome)))throw new Error('既有测试交易尚未确认，请继续查询原 ID。');
  }
  async function readyForAssess(a:LocalAccount, review:SessionOperation) {
    await refresh(a);
    const contract=address(review.contract);
    if(!sent.some(e=>e.kind==='deploy'&&e.outcome==='success'&&e.contract?.toLowerCase()===contract.toLowerCase()))throw new Error('只能评估本页临时账户已确认部署的合约；旧合约仍可只读查询。');
    const client=createClient({chain:studionet,endpoint:STUDIO_RPC});
    if(await digest(await client.getContractCode(contract))!==REVIEWED_SOURCE_SHA256)throw new Error('链上源码校验失败。');
    const raw=await client.readContract({address:contract,functionName:'get_snapshot',args:[]});
    if(raw!==review.snapshot)throw new Error('链上证据包与复核不一致。');
    if(await client.readContract({address:contract,functionName:'get_result',args:[]})!=='')throw new Error('此合约已有结果，不能重复 assess。');
  }
  return {
    get address(){return account?.address;},
    get uncertain(){return uncertain;},
    async start(confirmed:boolean) {
      if(!confirmed)throw new Error('请先确认仅在本页使用临时测试账户。');
      if(busy)throw new Error('上一项测试账户操作仍在处理中。');
      if(account)return account.address;
      if(uncertain)throw new Error('广播状态未知，不能在本页创建新账户重试。');
      busy=true;const g=generation;
      try{await preflight();if(g!==generation)throw new Error('账户创建已取消。');account=newAccount();sent.length=0;return account.address;}
      finally{busy=false;}
    },
    end(){generation++;account=null;},
    async prepare(input:SessionOperation):Promise<SessionReview> {
      const op=Object.freeze({...input});
      if(busy||uncertain)throw new Error('已有操作处理中或广播状态未知，请先核对原交易，勿重复提交。');
      const a=account,g=generation;if(!a)throw new Error('请先创建本页临时测试账户。');
      parseCase(op.snapshot);
      if(await digest(op.code)!==REVIEWED_SOURCE_SHA256)throw new Error('源码不属于已审核的 Agent SLA 合约，已停止。');
      if(op.kind==='assess')await readyForAssess(a,op);
      else {if(op.kind!=='deploy'||op.contract!=='')throw new Error('测试操作无效。');await refresh(a);}
      const target=await preflight();current(a,g);
      const review=Object.freeze({...op,account:a.address,target,at:now()});reviews.set(review,generation);return review;
    },
    async submit(review:SessionReview, confirmed:boolean) {
      if(!confirmed)throw new Error('需要明确确认这一次测试操作。');
      if(busy||uncertain||!reviews.has(review))throw new Error('复核已使用或操作状态未知，请勿重复提交。');
      // Consume before any await, including failures. No second signature on SDK ABI fallback.
      const reviewedGeneration=reviews.get(review);reviews.delete(review);busy=true;const a=account,g=generation;let signed=false;
      try {
        if(!a||a.address!==review.account||reviewedGeneration!==generation||now()-review.at>300000)throw new Error('账户或复核已失效，请重新准备。');
        const target=await preflight(review.target);current(a,g);await refresh(a);
        if(review.kind==='assess')await readyForAssess(a,review);
        const guardedAccount={...a,signTransaction:async (...args:Parameters<NonNullable<LocalAccount['signTransaction']>>) => {
          if(signed)throw new Error('同一次复核只允许签名一次，禁止 ABI 回退重发。');
          const tx=args[0];current(a,g);
          if(tx.chainId!==61999||tx.to?.toLowerCase()!==target.toLowerCase()||BigInt(tx.value??0)!==0n||BigInt(tx.gasPrice??-1)!==0n)throw new Error('测试交易的网络、派发地址、金额或费用不匹配，已停止。');
          await preflight(target);current(a,g);
          if(now()-review.at>300000)throw new Error('签名前复核已过期。');
          signed=true;return a.signTransaction!(...args);
        }} as LocalAccount;
        const chain={...studionet,consensusMainContract:{...studionet.consensusMainContract!,address:target}};
        const client=createClient({chain,endpoint:STUDIO_RPC,account:guardedAccount});
        current(a,g);
        const id=review.kind==='deploy'
          ?await client.deployContract({code:review.code,args:[review.snapshot]})
          :await client.writeContract({address:address(review.contract),functionName:'assess',args:[],value:0n});
        hash(id);sent.push({hash:id,kind:review.kind,outcome:'pending'});return id;
      } catch(e) {if(signed)uncertain=true;throw e;}
      finally{busy=false;}
    }
  };
}
